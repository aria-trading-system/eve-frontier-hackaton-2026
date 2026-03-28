/**
 * useDistributeTreasury — write hook for distributing treasury proportionally.
 *
 * distribute_treasury(syndicate, cap, recipients: vector<address>, amount: u64, ctx)
 *
 * Note: Move Table is not iterable — caller must pass the full list of
 * member addresses. We get these from useSyndicate().members.
 *
 * amount is in SUI (converted to MIST internally).
 */
import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import { PACKAGE_ID, MOD_SYNDICATE } from '../lib/constants';

function extractDigest(txResult: unknown): string {
    return (txResult as any)?.Transaction?.digest
        ?? (txResult as any)?.digest
        ?? 'unknown';
}

export function useDistributeTreasury(syndicateId: string, ownerCapId: string) {
    const dAppKit = useDAppKit();
    const account = useCurrentAccount();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const distributeTreasury = useCallback(async (
        recipients: string[],   // member addresses from useSyndicate().members
        amountSui: number       // in SUI — converted to MIST
    ): Promise<{ digest: string } | null> => {
        if (!account) { setError('No wallet connected'); return null; }
        if (recipients.length === 0) { setError('No recipients'); return null; }

        const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
        setIsPending(true);
        setError(null);

        try {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::distribute_treasury`,
                arguments: [
                    tx.object(syndicateId),
                    tx.object(ownerCapId),
                    tx.pure.vector('address', recipients),
                    tx.pure.u64(amountMist),
                ],
            });

            const txResult = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            return { digest: extractDigest(txResult) };
        } catch (err: any) {
            const msg = err?.message || String(err);
            setError(msg);
            console.error('useDistributeTreasury error:', err);
            return null;
        } finally {
            setIsPending(false);
        }
    }, [account, dAppKit, syndicateId, ownerCapId]);

    return { distributeTreasury, isPending, error };
}
