/**
 * useConfigureGate — write hook for configuring gate policy via zkLogin.
 *
 * PTB pattern (from configure-gate.ts):
 *   1. character::borrow_owner_cap<Gate> → gateOwnerCap + receipt
 *   2. gate_policy::configure_gate(config, adminCap, gate, ownerCap, syndicate, mode, toll, expiry)
 *   3. character::return_owner_cap<Gate> → return cap + receipt
 *
 * Signed via EVE Vault (zkLogin) through dAppKit.signAndExecuteTransaction.
 */
import { useState, useCallback } from 'react';
import { useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
    PACKAGE_ID,
    EXTENSION_CONFIG_ID,
    ADMIN_CAP_ID,
    WORLD_PACKAGE_ID,
    MOD_GATE_POLICY,
} from '../lib/constants';

// --- Types ---

export interface ConfigureGateParams {
    gateObjectId: string;
    gateOwnerCapId: string;
    characterObjectId: string;
    syndicateId: string;
    mode: number;        // 0-3
    tollMist: number;    // in MIST (0 if not applicable)
    expiryMs: number;    // permit duration in ms
}

// --- Hook ---

export function useConfigureGate() {
    const dAppKit = useDAppKit();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const configureGate = useCallback(async (params: ConfigureGateParams) => {
        setIsLoading(true);
        setError(null);

        try {
            const tx = new Transaction();

            // Step 1: borrow_owner_cap<Gate> from Character
            const [gateOwnerCap, receipt] = tx.moveCall({
                target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
                typeArguments: [`${WORLD_PACKAGE_ID}::gate::Gate`],
                arguments: [
                    tx.object(params.characterObjectId),
                    tx.object(params.gateOwnerCapId),
                ],
            });

            // Step 2: configure_gate
            tx.moveCall({
                target: `${PACKAGE_ID}::${MOD_GATE_POLICY}::configure_gate`,
                arguments: [
                    tx.object(EXTENSION_CONFIG_ID),
                    tx.object(ADMIN_CAP_ID),
                    tx.object(params.gateObjectId),
                    gateOwnerCap,
                    tx.object(params.syndicateId),
                    tx.pure.u8(params.mode),
                    tx.pure.u64(params.tollMist),
                    tx.pure.u64(params.expiryMs),
                ],
            });

            // Step 3: return_owner_cap<Gate>
            tx.moveCall({
                target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
                typeArguments: [`${WORLD_PACKAGE_ID}::gate::Gate`],
                arguments: [
                    tx.object(params.characterObjectId),
                    gateOwnerCap,
                    receipt,
                ],
            });

            const result = await dAppKit.signAndExecuteTransaction({
                transaction: tx,
            });

            return result;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [dAppKit]);

    return { configureGate, isLoading, error };
}
