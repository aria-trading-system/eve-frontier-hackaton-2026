/**
 * useSyndicateActions — mutation hooks for Syndicate management.
 *
 * Covers: invite, kick, promote, deposit, withdraw, leave.
 * All actions signed via connected wallet (EVE Vault or any Sui wallet).
 *
 * join_syndicate requires Character object (zkLogin) — handled in Step 9.
 */
import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import {
    PACKAGE_ID,
    MOD_SYNDICATE,
    CLOCK_OBJECT_ID,
} from '../lib/constants';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ActionResult {
    digest: string;
}

function extractDigest(txResult: unknown): string {
    return (txResult as any)?.Transaction?.digest
        ?? (txResult as any)?.digest
        ?? 'unknown';
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useSyndicateActions(syndicateId: string, ownerCapId: string) {
    const dAppKit = useDAppKit();
    const account = useCurrentAccount();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Shared executor — wraps any PTB
    const execute = useCallback(async (
        buildTx: (tx: Transaction) => void
    ): Promise<ActionResult | null> => {
        if (!account) { setError('No wallet connected'); return null; }
        setIsPending(true);
        setError(null);
        try {
            const tx = new Transaction();
            buildTx(tx);
            const txResult = await dAppKit.signAndExecuteTransaction({ transaction: tx });
            return { digest: extractDigest(txResult) };
        } catch (err: any) {
            const msg = err?.message || String(err);
            setError(msg);
            console.error('useSyndicateActions error:', err);
            return null;
        } finally {
            setIsPending(false);
        }
    }, [account, dAppKit]);

    // ── invite_member ──────────────────────────
    // invite_member(syndicate, cap, member: address, clock, ctx)
    const inviteMember = useCallback(async (memberAddress: string) => {
        return execute(tx => {
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::invite_member`,
                arguments: [
                    tx.object(syndicateId),
                    tx.object(ownerCapId),
                    tx.pure.address(memberAddress),
                    tx.object(CLOCK_OBJECT_ID),
                ],
            });
        });
    }, [execute, syndicateId, ownerCapId]);

    // ── kick_member ────────────────────────────
    // kick_member(syndicate, cap, member: address)
    const kickMember = useCallback(async (memberAddress: string) => {
        return execute(tx => {
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::kick_member`,
                arguments: [
                    tx.object(syndicateId),
                    tx.object(ownerCapId),
                    tx.pure.address(memberAddress),
                ],
            });
        });
    }, [execute, syndicateId, ownerCapId]);

    // ── promote_to_officer ─────────────────────
    // promote_to_officer(syndicate, cap, member: address)
    const promoteToOfficer = useCallback(async (memberAddress: string) => {
        return execute(tx => {
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::promote_to_officer`,
                arguments: [
                    tx.object(syndicateId),
                    tx.object(ownerCapId),
                    tx.pure.address(memberAddress),
                ],
            });
        });
    }, [execute, syndicateId, ownerCapId]);

    // ── deposit ────────────────────────────────
    // deposit(syndicate, payment: Coin<SUI>)
    // Split from gas coin — standard PTB pattern for SUI payments
    const deposit = useCallback(async (amountSui: number) => {
        const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
        return execute(tx => {
            const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::deposit`,
                arguments: [
                    tx.object(syndicateId),
                    coin,
                ],
            });
        });
    }, [execute, syndicateId]);

    // ── withdraw ───────────────────────────────
    // withdraw(syndicate, cap, amount: u64, ctx) → Coin<SUI>
    // Transfer returned coin to sender
    const withdraw = useCallback(async (amountSui: number) => {
        const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
        return execute(tx => {
            const coin = tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::withdraw`,
                arguments: [
                    tx.object(syndicateId),
                    tx.object(ownerCapId),
                    tx.pure.u64(amountMist),
                ],
            });
            tx.transferObjects([coin], tx.pure.address(account!.address));
        });
    }, [execute, syndicateId, ownerCapId, account]);


    // ── join_syndicate ─────────────────────────
    // join_syndicate(syndicate, character, clock, ctx) — public syndicate only
    const joinSyndicate = useCallback(async (characterObjectId: string) => {
        return execute(tx => {
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::join_syndicate`,
                arguments: [
                    tx.object(syndicateId),
                    tx.object(characterObjectId),
                    tx.object(CLOCK_OBJECT_ID),
                ],
            });
        });
    }, [execute, syndicateId]);

    // ── leave_syndicate ────────────────────────
    // leave_syndicate(syndicate, ctx) — no cap needed
    const leaveSyndicate = useCallback(async () => {
        return execute(tx => {
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_SYNDICATE}::leave_syndicate`,
                arguments: [
                    tx.object(syndicateId),
                ],
            });
        });
    }, [execute, syndicateId]);

    return {
        inviteMember,
        kickMember,
        promoteToOfficer,
        joinSyndicate,
        deposit,
        withdraw,
        leaveSyndicate,
        isPending,
        error,
    };
}
