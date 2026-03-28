/**
 * useRecordContribution — write hook for recording member contributions.
 *
 * Officer action: record_contribution(syndicate, record, cap, contributor,
 *   resource_type, quantity, market_price_per_unit, notes, clock)
 *
 * contributionRecordId is now a parameter (not hardcoded from constants).
 */
import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import {
    PACKAGE_ID,
    MOD_SYNDICATE,
    CLOCK_OBJECT_ID,
} from '../lib/constants';

export interface RecordContributionParams {
    syndicateId: string;
    ownerCapId: string;
    contributionRecordId: string;
    contributor: string;       // member address
    resource_type: string;     // e.g. "building_foam", "carbon_weave"
    quantity: number;
    market_price_per_unit: number;  // in MIST
    notes: string;
}

function extractDigest(txResult: unknown): string {
    return (txResult as any)?.Transaction?.digest
        ?? (txResult as any)?.digest
        ?? 'unknown';
}

export function useRecordContribution() {
    const dAppKit = useDAppKit();
    const account = useCurrentAccount();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const recordContribution = useCallback(async (
        params: RecordContributionParams
    ): Promise<{ digest: string } | null> => {
        if (!account) { setError('No wallet connected'); return null; }
        if (!params.contributionRecordId) { setError('Contribution record not found'); return null; }
        setIsPending(true);
        setError(null);

        try {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::record_contribution`,
                arguments: [
                    tx.object(params.syndicateId),
                    tx.object(params.contributionRecordId),
                    tx.object(params.ownerCapId),
                    tx.pure.address(params.contributor),
                    tx.pure.string(params.resource_type),
                    tx.pure.u64(params.quantity),
                    tx.pure.u64(params.market_price_per_unit),
                    tx.pure.string(params.notes),
                    tx.object(CLOCK_OBJECT_ID),
                ],
            });

            const txResult = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            return { digest: extractDigest(txResult) };
        } catch (err: any) {
            const msg = err?.message || String(err);
            setError(msg);
            console.error('useRecordContribution error:', err);
            return null;
        } finally {
            setIsPending(false);
        }
    }, [account, dAppKit]);

    return { recordContribution, isPending, error };
}
