/**
 * useSyndicateLookup — resolves ownerCapId + contributionRecordId for any syndicate.
 *
 * Strategy:
 *   ownerCapId: suix_getOwnedObjects filtered by SyndicateOwnerCap → match syndicate_id
 *   contributionRecordId: suix_queryTransactionBlocks(ChangedObject: syndicateId)
 *     → find creation tx → objectChanges → ContributionRecord
 *
 * Accepts hints from navigation state to skip lookups when values already known.
 */
import { useQuery } from '@tanstack/react-query';
import { RPC_URL, PACKAGE_ID } from '../lib/constants';

// --- Lookup: ContributionRecord ID via creation tx ---

async function lookupContributionRecordId(syndicateId: string): Promise<string | null> {
    // Find the first tx that changed this syndicate (= creation tx)
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_queryTransactionBlocks',
            params: [
                {
                    filter: { ChangedObject: syndicateId },
                    options: { showObjectChanges: true },
                },
                null,  // cursor
                1,     // limit
                false, // descending_order = false → ascending (oldest first)
            ],
        }),
    });
    const data = await response.json();
    const tx = data?.result?.data?.[0];
    if (!tx?.objectChanges) return null;

    const crChange = tx.objectChanges.find(
        (c: any) => c.type === 'created'
            && c.objectType?.includes('::contribution::ContributionRecord')
    );
    return crChange?.objectId ?? null;
}

// --- Lookup: OwnerCap ID via wallet owned objects ---

async function lookupOwnerCapId(syndicateId: string, walletAddress: string): Promise<string | null> {
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_getOwnedObjects',
            params: [
                walletAddress,
                {
                    filter: { StructType: `${PACKAGE_ID}::syndicate::SyndicateOwnerCap` },
                    options: { showContent: true },
                },
                null,
                50,
            ],
        }),
    });
    const data = await response.json();
    const caps = data?.result?.data ?? [];
    const cap = caps.find(
        (c: any) => c?.data?.content?.fields?.syndicate_id === syndicateId
    );
    return cap?.data?.objectId ?? null;
}

// --- Hook ---

export function useSyndicateLookup(
    syndicateId: string | undefined,
    walletAddress: string | undefined,
    hints?: { ownerCapId?: string; contributionRecordId?: string }
) {
    // Contribution Record ID — skip if hint provided
    const crQuery = useQuery({
        queryKey: ['contribution-record-lookup', syndicateId],
        queryFn: () => lookupContributionRecordId(syndicateId!),
        enabled: !!syndicateId && !hints?.contributionRecordId,
        staleTime: 5 * 60_000,  // cache 5 min — doesn't change after creation
        retry: 2,
    });

    // Owner Cap ID — skip if hint provided
    const capQuery = useQuery({
        queryKey: ['owner-cap-lookup', syndicateId, walletAddress],
        queryFn: () => lookupOwnerCapId(syndicateId!, walletAddress!),
        enabled: !!syndicateId && !!walletAddress && !hints?.ownerCapId,
        staleTime: 5 * 60_000,
        retry: 2,
    });

    return {
        ownerCapId: hints?.ownerCapId ?? capQuery.data ?? null,
        contributionRecordId: hints?.contributionRecordId ?? crQuery.data ?? null,
        isLoading:
            (!hints?.contributionRecordId && crQuery.isLoading) ||
            (!hints?.ownerCapId && !!walletAddress && capQuery.isLoading),
    };
}
