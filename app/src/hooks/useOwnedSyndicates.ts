/**
 * useOwnedSyndicates — fetches all Syndicates owned by a wallet address.
 *
 * Strategy:
 *   1. suix_getOwnedObjects filtered by SyndicateOwnerCap type → list of caps
 *   2. For each cap: getObject(cap.syndicate_id) → syndicate name + invite_only
 *
 * Uses direct JSON-RPC (not gRPC) for getOwnedObjects — simpler and reliable.
 * Uses gRPC client (same as useSyndicate) for getObject calls.
 */
import { useQuery } from '@tanstack/react-query';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { PACKAGE_ID, RPC_URL } from '../lib/constants';

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });

export interface OwnedSyndicateItem {
    syndicateId: string;
    ownerCapId: string;
    name: string;
    invite_only: boolean;
    member_count: number;
}

async function fetchOwnedSyndicates(address: string): Promise<OwnedSyndicateItem[]> {
    // Step 1: get all SyndicateOwnerCap objects owned by address
    const rpcResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_getOwnedObjects',
            params: [
                address,
                {
                    filter: {
                        StructType: `${PACKAGE_ID}::syndicate::SyndicateOwnerCap`,
                    },
                    options: { showContent: true },
                },
                null,
                50,
            ],
        }),
    });

    const rpcData = await rpcResponse.json();
    const caps = rpcData?.result?.data ?? [];

    if (caps.length === 0) return [];

    // Step 2: for each cap, fetch syndicate data
    const results: OwnedSyndicateItem[] = [];

    for (const capObj of caps) {
        const capId = capObj?.data?.objectId;
        const syndicateId = capObj?.data?.content?.fields?.syndicate_id;
        if (!capId || !syndicateId) continue;

        try {
            const syndResponse = await client.getObject({
                objectId: syndicateId,
                include: { json: true },
            });
            const json = (syndResponse as any)?.object?.json;
            if (!json) continue;

            results.push({
                syndicateId,
                ownerCapId: capId,
                name: json.name ?? 'Unknown',
                invite_only: json.invite_only ?? false,
                member_count: parseInt(json.member_count ?? '0', 10),
            });
        } catch {
            // If syndicate fetch fails, still show cap with placeholder
            results.push({
                syndicateId,
                ownerCapId: capId,
                name: 'Unknown',
                invite_only: false,
                member_count: 0,
            });
        }
    }

    return results;
}

export function useOwnedSyndicates(address: string | undefined) {
    return useQuery({
        queryKey: ['owned-syndicates', address],
        queryFn: () => fetchOwnedSyndicates(address!),
        enabled: !!address,
        staleTime: 30_000,
        retry: 2,
    });
}
