/**
 * useConfigureGate — write hook for configuring gate policy via zkLogin.
 *
 * PTB pattern follows CCP's authorise-gate-extension.ts exactly:
 *   1. borrow_owner_cap<Gate>(character, owner_cap) → [cap, receipt]
 *   2. configure_gate(config, gate, cap, syndicate, mode, toll, expiry)
 *   3. return_owner_cap<Gate>(character, cap, receipt)
 *
 * All objects passed via tx.object() — Sui SDK resolves shared/receiving automatically.
 */
import { useState, useCallback } from 'react';
import { useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
    PACKAGE_ID,
    EXTENSION_CONFIG_ID,
    WORLD_PACKAGE_ID,
    RPC_URL,
    MOD_GATE_POLICY,
} from '../lib/constants';

export interface ConfigureGateParams {
    gateObjectId: string;
    characterObjectId: string;
    syndicateId: string;
    mode: number;
    tollMist: number;
    expiryMs: number;
}

async function fetchOwnerCapId(gateObjectId: string): Promise<string> {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'sui_getObject',
            params: [gateObjectId, { showContent: true }],
        }),
    });
    const data = await res.json();
    const ownerCapId = data?.result?.data?.content?.fields?.owner_cap_id;
    if (!ownerCapId) throw new Error(`Cannot read owner_cap_id from Gate`);
    return ownerCapId;
}

/** Helper: build a PTB that borrows OwnerCap, calls one function, returns cap. */
function buildOwnerCapTx(
    tx: Transaction,
    characterObjectId: string,
    ownerCapId: string,
): { gateOwnerCap: any; returnReceipt: any } {
    const [gateOwnerCap, returnReceipt] = tx.moveCall({
        target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
        typeArguments: [`${WORLD_PACKAGE_ID}::gate::Gate`],
        arguments: [tx.object(characterObjectId), tx.object(ownerCapId)],
    });
    return { gateOwnerCap, returnReceipt };
}

function returnOwnerCap(
    tx: Transaction,
    characterObjectId: string,
    gateOwnerCap: any,
    returnReceipt: any,
) {
    tx.moveCall({
        target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
        typeArguments: [`${WORLD_PACKAGE_ID}::gate::Gate`],
        arguments: [tx.object(characterObjectId), gateOwnerCap, returnReceipt],
    });
}

export function useConfigureGate() {
    const dAppKit = useDAppKit();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const configureGate = useCallback(async (params: ConfigureGateParams) => {
        setIsLoading(true);
        setError(null);

        try {
            const ownerCapId = await fetchOwnerCapId(params.gateObjectId);
            const tx = new Transaction();
            const { gateOwnerCap, returnReceipt } = buildOwnerCapTx(tx, params.characterObjectId, ownerCapId);

            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_GATE_POLICY}::configure_gate`,
                arguments: [
                    tx.object(EXTENSION_CONFIG_ID),
                    tx.object(params.gateObjectId),
                    gateOwnerCap,
                    tx.object(params.syndicateId),
                    tx.pure.u8(params.mode),
                    tx.pure.u64(params.tollMist),
                    tx.pure.u64(params.expiryMs),
                ],
            });

            returnOwnerCap(tx, params.characterObjectId, gateOwnerCap, returnReceipt);
            return await dAppKit.signAndExecuteTransaction({ transaction: tx });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [dAppKit]);

    // === Address Blacklist ===

    const addToBlacklist = useCallback(async (
        gateObjectId: string, characterObjectId: string, addr: string
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const ownerCapId = await fetchOwnerCapId(gateObjectId);
            const tx = new Transaction();
            const { gateOwnerCap, returnReceipt } = buildOwnerCapTx(tx, characterObjectId, ownerCapId);
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_GATE_POLICY}::add_to_blacklist`,
                arguments: [
                    tx.object(EXTENSION_CONFIG_ID),
                    tx.object(gateObjectId),
                    gateOwnerCap,
                    tx.pure.address(addr),
                ],
            });
            returnOwnerCap(tx, characterObjectId, gateOwnerCap, returnReceipt);
            return await dAppKit.signAndExecuteTransaction({ transaction: tx });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [dAppKit]);

    const removeFromBlacklist = useCallback(async (
        gateObjectId: string, characterObjectId: string, addr: string
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const ownerCapId = await fetchOwnerCapId(gateObjectId);
            const tx = new Transaction();
            const { gateOwnerCap, returnReceipt } = buildOwnerCapTx(tx, characterObjectId, ownerCapId);
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_GATE_POLICY}::remove_from_blacklist`,
                arguments: [
                    tx.object(EXTENSION_CONFIG_ID),
                    tx.object(gateObjectId),
                    gateOwnerCap,
                    tx.pure.address(addr),
                ],
            });
            returnOwnerCap(tx, characterObjectId, gateOwnerCap, returnReceipt);
            return await dAppKit.signAndExecuteTransaction({ transaction: tx });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [dAppKit]);

    // === Tribe Blocking ===

    const addBlockedTribe = useCallback(async (
        gateObjectId: string, characterObjectId: string, tribeId: number
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const ownerCapId = await fetchOwnerCapId(gateObjectId);
            const tx = new Transaction();
            const { gateOwnerCap, returnReceipt } = buildOwnerCapTx(tx, characterObjectId, ownerCapId);
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_GATE_POLICY}::add_blocked_tribe`,
                arguments: [
                    tx.object(EXTENSION_CONFIG_ID),
                    tx.object(gateObjectId),
                    gateOwnerCap,
                    tx.pure.u32(tribeId),
                ],
            });
            returnOwnerCap(tx, characterObjectId, gateOwnerCap, returnReceipt);
            return await dAppKit.signAndExecuteTransaction({ transaction: tx });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [dAppKit]);

    const removeBlockedTribe = useCallback(async (
        gateObjectId: string, characterObjectId: string, tribeId: number
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const ownerCapId = await fetchOwnerCapId(gateObjectId);
            const tx = new Transaction();
            const { gateOwnerCap, returnReceipt } = buildOwnerCapTx(tx, characterObjectId, ownerCapId);
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_GATE_POLICY}::remove_blocked_tribe`,
                arguments: [
                    tx.object(EXTENSION_CONFIG_ID),
                    tx.object(gateObjectId),
                    gateOwnerCap,
                    tx.pure.u32(tribeId),
                ],
            });
            returnOwnerCap(tx, characterObjectId, gateOwnerCap, returnReceipt);
            return await dAppKit.signAndExecuteTransaction({ transaction: tx });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [dAppKit]);

    return {
        configureGate,
        addToBlacklist, removeFromBlacklist,
        addBlockedTribe, removeBlockedTribe,
        isLoading, error,
    };
}
