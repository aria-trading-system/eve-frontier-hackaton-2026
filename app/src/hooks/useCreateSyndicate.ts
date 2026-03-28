/**
 * useCreateSyndicate — sends a real create_syndicate tx via connected wallet.
 *
 * PTB structure (from ts-scripts/create-syndicate.ts):
 *   1. syndicate::create_syndicate(name, invite_only, Clock) → SyndicateOwnerCap
 *   2. syndicate::syndicate_id(cap) → syndicateId
 *   3. contribution::init_contribution_record(syndicateId)
 *   4. contribution::share(record)
 *   5. transferObjects([cap], sender)
 *
 * After tx: fetches objectChanges to extract syndicateId, ownerCapId, contributionRecordId.
 */
import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import {
    PACKAGE_ID,
    MOD_SYNDICATE,
    MOD_CONTRIBUTION,
    CLOCK_OBJECT_ID,
    RPC_URL,
} from '../lib/constants';

export interface CreateSyndicateResult {
    digest: string;
    syndicateId: string | null;
    ownerCapId: string | null;
    contributionRecordId: string | null;
}

function extractDigest(txResult: unknown): string {
    return (txResult as any)?.Transaction?.digest
        ?? (txResult as any)?.digest
        ?? 'unknown';
}

export function useCreateSyndicate() {
    const dAppKit = useDAppKit();
    const account = useCurrentAccount();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<CreateSyndicateResult | null>(null);

    const createSyndicate = useCallback(async ({
        name,
        inviteOnly,
    }: {
        name: string;
        inviteOnly: boolean;
    }) => {
        if (!account) {
            setError('No wallet connected');
            return null;
        }

        setIsPending(true);
        setError(null);
        setResult(null);

        try {
            const tx = new Transaction();

            // 1. Create syndicate → returns SyndicateOwnerCap
            const cap = tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::create_syndicate`,
                arguments: [
                    tx.pure.string(name),
                    tx.pure.bool(inviteOnly),
                    tx.object(CLOCK_OBJECT_ID),
                ],
            });

            // 2. Get syndicate_id from cap
            const syndicateId = tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::syndicate_id`,
                arguments: [cap],
            });

            // 3. Init contribution record
            const record = tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_CONTRIBUTION}::init_contribution_record`,
                arguments: [syndicateId],
            });

            // 4. Share the contribution record
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_CONTRIBUTION}::share`,
                arguments: [record],
            });

            // 5. Transfer cap to sender
            tx.transferObjects([cap], tx.pure.address(account.address));

            // Sign & execute via connected wallet (EVE Vault)
            const txResult = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            const digest = extractDigest(txResult);

            // Fetch tx block to parse created objects
            let createdSyndicateId: string | null = null;
            let createdOwnerCapId: string | null = null;
            let createdContributionRecordId: string | null = null;

            try {
                const txBlockRes = await fetch(RPC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'sui_getTransactionBlock',
                        params: [digest, { showObjectChanges: true }],
                    }),
                });
                const txData = await txBlockRes.json();
                const changes = txData?.result?.objectChanges ?? [];

                for (const c of changes) {
                    if (c.type !== 'created') continue;
                    const t = c.objectType ?? '';
                    if (t.includes('::syndicate::Syndicate') && !t.includes('OwnerCap')) {
                        createdSyndicateId = c.objectId;
                    } else if (t.includes('::syndicate::SyndicateOwnerCap')) {
                        createdOwnerCapId = c.objectId;
                    } else if (t.includes('::contribution::ContributionRecord')) {
                        createdContributionRecordId = c.objectId;
                    }
                }
            } catch {
                // Non-critical — navigation still works via digest
            }

            const res: CreateSyndicateResult = {
                digest,
                syndicateId: createdSyndicateId,
                ownerCapId: createdOwnerCapId,
                contributionRecordId: createdContributionRecordId,
            };
            setResult(res);
            return res;
        } catch (err: any) {
            const msg = err?.message || String(err);
            setError(msg);
            console.error('useCreateSyndicate error:', err);
            return null;
        } finally {
            setIsPending(false);
        }
    }, [account, dAppKit]);

    return { createSyndicate, isPending, error, result };
}
