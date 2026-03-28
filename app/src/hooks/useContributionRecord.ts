/**
 * useContributionRecord — read-only hook for ContributionRecord data from Utopia.
 *
 * Strategy (same pattern as useSyndicate, Session 040):
 *   1. getObject(contributionRecordId) → next_entry_id + entries table ID
 *   2. listDynamicFields(tableId) → fieldId per entry
 *   3. getObject(fieldId) per entry → ContributionEntry as clean JSON
 *
 * Uses standalone SuiGrpcClient (no React context — avoids version mismatch).
 * Uses react-query for caching, retry, and loading state.
 */
import { useQuery } from '@tanstack/react-query';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { RPC_URL } from '../lib/constants';

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });

// --- Types ---

export interface ContributionEntry {
    entry_id: number;
    contributor: string;
    resource_type: string;
    quantity: number;
    market_price_per_unit: number;  // in MIST
    total_value: number;            // in MIST
    timestamp: number;              // ms
    notes: string;
}

export interface ContributionRecordData {
    id: string;
    syndicate_id: string;
    next_entry_id: number;
    entries_table_id: string;
}

// --- Fetchers ---

async function fetchContributionRecord(recordId: string): Promise<ContributionRecordData> {
    const response = await client.getObject({
        objectId: recordId,
        include: { json: true },
    });

    const json = (response as any)?.object?.json;
    if (!json) throw new Error('ContributionRecord not found or no JSON data');

    return {
        id: json.id,
        syndicate_id: json.syndicate_id,
        next_entry_id: parseInt(json.next_entry_id ?? '0', 10),
        entries_table_id: json.entries?.id ?? '',
    };
}

async function fetchEntries(tableId: string): Promise<ContributionEntry[]> {
    if (!tableId) return [];

    const listResponse = await client.listDynamicFields({
        parentId: tableId,
        limit: 100,
    });

    const fields = (listResponse as any)?.dynamicFields;
    if (!Array.isArray(fields) || fields.length === 0) return [];

    const entries: ContributionEntry[] = [];

    for (const field of fields) {
        const fieldResponse = await client.getObject({
            objectId: field.fieldId,
            include: { json: true },
        });

        const fieldJson = (fieldResponse as any)?.object?.json;
        if (!fieldJson) continue;

        entries.push({
            entry_id: parseInt(fieldJson.name ?? '0', 10),   // Table key = entry_id (u64)
            contributor: fieldJson.value?.contributor ?? '',
            resource_type: fieldJson.value?.resource_type ?? '',
            quantity: parseInt(fieldJson.value?.quantity ?? '0', 10),
            market_price_per_unit: parseInt(fieldJson.value?.market_price_per_unit ?? '0', 10),
            total_value: parseInt(fieldJson.value?.total_value ?? '0', 10),
            timestamp: parseInt(fieldJson.value?.timestamp ?? '0', 10),
            notes: fieldJson.value?.notes ?? '',
        });
    }

    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries;
}

// --- Hook ---

export function useContributionRecord(recordId: string | undefined) {
    // Query 1: ContributionRecord base data
    const recordQuery = useQuery({
        queryKey: ['contribution-record', recordId],
        queryFn: () => fetchContributionRecord(recordId!),
        enabled: !!recordId,
        staleTime: 30_000,
        retry: 2,
    });

    // Query 2: Entries (depends on record → tableId)
    const tableId = recordQuery.data?.entries_table_id;

    const entriesQuery = useQuery({
        queryKey: ['contribution-entries', recordId, tableId],
        queryFn: () => fetchEntries(tableId!),
        enabled: !!tableId,
        staleTime: 30_000,
        retry: 2,
    });

    return {
        record: recordQuery.data ?? null,
        entries: entriesQuery.data ?? [],
        isLoading: recordQuery.isLoading || (recordQuery.isSuccess && entriesQuery.isLoading),
        error: recordQuery.error || entriesQuery.error,
        refetch: () => {
            recordQuery.refetch();
            entriesQuery.refetch();
        },
    };
}
