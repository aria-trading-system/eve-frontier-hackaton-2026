/**
 * useGateInfo — read-only hook for Gate object fields.
 *
 * Reads directly from the Gate shared object on chain:
 *   - linked_gate_id: the paired gate (if linked)
 *   - owner_cap_id: OwnerCap for this gate (used by useConfigureGate)
 *   - status, extension, metadata
 *
 * Uses JSON-RPC sui_getObject (same pattern as other hooks).
 */
import { useQuery } from '@tanstack/react-query';
import { RPC_URL } from '../lib/constants';

// --- Types ---

export interface GateInfo {
    gateObjectId: string;
    ownerCapId: string;
    linkedGateId: string | null;
    typeId: number;
    isOnline: boolean;
    hasExtension: boolean;
    name: string | null;
}

// --- Fetcher ---

async function fetchGateInfo(gateObjectId: string): Promise<GateInfo | null> {
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_getObject',
            params: [
                gateObjectId,
                { showContent: true },
            ],
        }),
    });

    const data = await response.json();
    const fields = data?.result?.data?.content?.fields;

    if (!fields) return null;

    // linked_gate_id: Sui JSON-RPC returns Option<ID> as direct string or null
    const linkedRaw = fields.linked_gate_id;
    const resolvedLinkedId = (typeof linkedRaw === 'string' && linkedRaw.startsWith('0x'))
        ? linkedRaw
        : null;

    // status is AssemblyStatus → nested Status enum
    const statusField = fields.status?.fields?.status?.fields;
    const isOnline = statusField?.variant === 'Online' || 
        fields.status?.fields?.status?.type?.includes('Online') ||
        false;

    // extension: Option<TypeName> — string or null from JSON-RPC
    const extension = fields.extension;
    const hasExtension = extension !== null && extension !== undefined;

    // metadata may contain name
    const metadata = fields.metadata?.fields?.some?.fields ?? fields.metadata?.Some?.fields ?? null;
    const name = metadata?.name ?? null;

    return {
        gateObjectId,
        ownerCapId: fields.owner_cap_id ?? '',
        linkedGateId: resolvedLinkedId,
        typeId: parseInt(fields.type_id ?? '0', 10),
        isOnline,
        hasExtension,
        name,
    };
}

// --- Hook ---

export function useGateInfo(gateObjectId: string | undefined) {
    const query = useQuery({
        queryKey: ['gate-info', gateObjectId],
        queryFn: () => fetchGateInfo(gateObjectId!),
        enabled: !!gateObjectId,
        staleTime: 30_000,
        retry: 2,
    });

    return {
        gateInfo: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}
