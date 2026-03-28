/**
 * useJumpHistory — read hook for recent JumpPermitIssuedEvent events.
 *
 * Queries on-chain events emitted by gate_policy::request_jump_permit.
 * Filters by gate_id client-side (event query doesn't support field filter).
 */
import { useQuery } from '@tanstack/react-query';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { RPC_URL, PACKAGE_ID, MOD_GATE_POLICY } from '../lib/constants';

const client = new SuiJsonRpcClient({ network: 'testnet', url: RPC_URL });

// --- Types ---

export interface JumpEvent {
    gateId: string;
    character: string;
    paidToll: boolean;
    proximityVerified: boolean;
    timestamp: number;         // ms (from event timestamp or tx timestamp)
    txDigest: string;
}

// --- Fetcher ---

async function fetchJumpHistory(gateObjectId: string): Promise<JumpEvent[]> {
    const eventType = `${PACKAGE_ID}::${MOD_GATE_POLICY}::JumpPermitIssuedEvent`;

    const response = await client.queryEvents({
        query: { MoveEventType: eventType },
        limit: 50,
        order: 'descending',
    });

    const events = (response as any)?.events || (response as any)?.data || [];
    if (!Array.isArray(events) || events.length === 0) return [];

    return events
        .filter((evt: any) => {
            const parsed = evt.parsedJson || evt.parsedJSON || {};
            return parsed.gate_id === gateObjectId;
        })
        .map((evt: any) => {
            const parsed = evt.parsedJson || evt.parsedJSON || {};
            return {
                gateId: parsed.gate_id || '',
                character: parsed.character || '',
                paidToll: parsed.paid_toll === true || parsed.paid_toll === 'true',
                proximityVerified: parsed.proximity_verified === true || parsed.proximity_verified === 'true',
                timestamp: parseInt(evt.timestampMs || evt.timestamp || '0', 10),
                txDigest: evt.id?.txDigest || evt.txDigest || '',
            };
        });
}

// --- Hook ---

export function useJumpHistory(gateObjectId: string | undefined) {
    const query = useQuery({
        queryKey: ['jump-history', gateObjectId],
        queryFn: () => fetchJumpHistory(gateObjectId!),
        enabled: !!gateObjectId,
        staleTime: 60_000,     // cache 1 min — events don't change retroactively
        retry: 2,
    });

    return {
        jumps: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}
