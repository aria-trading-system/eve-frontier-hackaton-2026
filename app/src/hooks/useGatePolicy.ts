/**
 * useGatePolicy — read-only hook for GatePolicy from ExtensionConfig.
 *
 * GatePolicy is a dynamic field on ExtensionConfig, keyed by GatePolicyKey { gate_id }.
 * Strategy:
 *   1. listDynamicFields(EXTENSION_CONFIG_ID) → find field with matching gate_id
 *   2. getObject(fieldId, { json: true }) → parse GatePolicy fields
 *
 * Returns null if no policy configured for this gate (gate not yet configured).
 * Same pattern as useSyndicate.ts — standalone SuiGrpcClient + react-query.
 */
import { useQuery } from '@tanstack/react-query';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { RPC_URL, EXTENSION_CONFIG_ID, PACKAGE_ID } from '../lib/constants';

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });

// --- Types ---

export interface GatePolicyData {
    syndicateId: string;
    mode: number;              // 0-3
    tollFee: number;           // MIST
    expiryMs: number;
    requireProximity: boolean;
    maxDistance: number;
    blacklist: string[];
}

// --- Fetcher ---

async function fetchGatePolicy(gateObjectId: string): Promise<GatePolicyData | null> {
    // List all dynamic fields on ExtensionConfig
    const listResponse = await client.listDynamicFields({
        parentId: EXTENSION_CONFIG_ID,
        limit: 50,
    });

    const fields = (listResponse as any)?.dynamicFields;
    if (!Array.isArray(fields) || fields.length === 0) return null;

    // Find field whose key type is GatePolicyKey and gate_id matches
    const gatePolicyType = `${PACKAGE_ID}::gate_policy::GatePolicyKey`;
    const matchingField = fields.find((f: any) => {
        const keyType = f.name?.type || f.objectType || '';
        if (!keyType.includes('GatePolicyKey')) return false;
        // Check gate_id in key value
        const keyValue = f.name?.value || f.name?.json || {};
        const fieldGateId = keyValue.gate_id || '';
        return fieldGateId === gateObjectId;
    });

    if (!matchingField) return null;

    // Fetch full field object for GatePolicy data
    const fieldResponse = await client.getObject({
        objectId: matchingField.fieldId,
        include: { json: true },
    });

    const json = (fieldResponse as any)?.object?.json;
    if (!json) return null;

    // Dynamic field object: { name: key, value: GatePolicy }
    const policy = json.value || json;

    return {
        syndicateId: policy.syndicate_id || '',
        mode: parseInt(policy.mode ?? '0', 10),
        tollFee: parseInt(policy.toll_fee ?? '0', 10),
        expiryMs: parseInt(policy.expiry_ms ?? '0', 10),
        requireProximity: policy.require_proximity === true || policy.require_proximity === 'true',
        maxDistance: parseInt(policy.max_distance ?? '0', 10),
        blacklist: Array.isArray(policy.blacklist) ? policy.blacklist : [],
    };
}

// --- Hook ---

export function useGatePolicy(gateObjectId: string | undefined) {
    const query = useQuery({
        queryKey: ['gate-policy', gateObjectId],
        queryFn: () => fetchGatePolicy(gateObjectId!),
        enabled: !!gateObjectId,
        staleTime: 30_000,
        retry: 2,
    });

    return {
        policy: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}
