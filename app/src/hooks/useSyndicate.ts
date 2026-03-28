/**
 * useSyndicate — read-only hook for Syndicate data from Utopia.
 *
 * Strategy (verified in browser, Session 040):
 *   1. getObject(syndicateId) → syndicate info + members table ID
 *   2. listDynamicFields(tableId) → fieldId per member
 *   3. getObject(fieldId) per member → MemberInfo as clean JSON
 *
 * No BCS decoder needed — getObject(fieldId, { json: true }) returns JSON.
 * Uses standalone SuiGrpcClient (no React context — avoids version mismatch).
 * Uses react-query for caching, retry, and loading state.
 */
import { useQuery } from '@tanstack/react-query';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { RPC_URL } from '../lib/constants';

// Standalone client — no React context needed (avoids dapp-kit version mismatch)
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });

// --- Types ---

export interface SyndicateData {
    id: string;
    name: string;
    invite_only: boolean;
    member_count: number;
    treasury: number;          // in MIST
    created_at: number;        // ms timestamp
    total_contribution_score: number;
    members_table_id: string;
    entry_requirements: {
        min_memories: string | null;
        required_crown: string | null;
        required_tribe_id: string | null;
    };
}

export interface MemberData {
    address: string;
    role: number;              // 0=Member, 1=Officer, 2=Owner
    joined_at: number;         // ms timestamp
    invited_by: string;
    contribution_score: number;
}

// --- Fetchers ---

async function fetchSyndicate(syndicateId: string): Promise<SyndicateData> {
    const response = await client.getObject({
        objectId: syndicateId,
        include: { json: true },
    });

    const json = (response as any)?.object?.json;
    if (!json) throw new Error('Syndicate not found or no JSON data');

    return {
        id: json.id,
        name: json.name,
        invite_only: json.invite_only,
        member_count: parseInt(json.member_count, 10),
        treasury: parseInt(json.treasury, 10),
        created_at: parseInt(json.created_at, 10),
        total_contribution_score: parseInt(json.total_contribution_score, 10),
        members_table_id: json.members?.id ?? '',
        entry_requirements: json.entry_requirements ?? {
            min_memories: null,
            required_crown: null,
            required_tribe_id: null,
        },
    };
}

async function fetchMembers(tableId: string): Promise<MemberData[]> {
    if (!tableId) return [];

    // Step 1: list all dynamic fields → get fieldIds
    const listResponse = await client.listDynamicFields({
        parentId: tableId,
        limit: 50,
    });

    const fields = (listResponse as any)?.dynamicFields;
    if (!Array.isArray(fields) || fields.length === 0) return [];

    // Step 2: getObject for each fieldId → clean JSON (no BCS)
    const members: MemberData[] = [];

    for (const field of fields) {
        const fieldResponse = await client.getObject({
            objectId: field.fieldId,
            include: { json: true },
        });

        const fieldJson = (fieldResponse as any)?.object?.json;
        if (!fieldJson) continue;

        members.push({
            address: fieldJson.name,             // Table key = member address
            role: fieldJson.value?.role ?? 0,
            joined_at: parseInt(fieldJson.value?.joined_at ?? '0', 10),
            invited_by: fieldJson.value?.invited_by ?? '',
            contribution_score: parseInt(fieldJson.value?.contribution_score ?? '0', 10),
        });
    }

    // Sort: Owner first, then Officer, then Member
    members.sort((a, b) => b.role - a.role);

    return members;
}

// --- Hook ---

export function useSyndicate(syndicateId: string | undefined) {
    // Query 1: Syndicate base data
    const syndicateQuery = useQuery({
        queryKey: ['syndicate', syndicateId],
        queryFn: () => fetchSyndicate(syndicateId!),
        enabled: !!syndicateId,
        staleTime: 30_000,       // cache 30s — onchain data doesn't change every second
        retry: 2,
    });

    // Query 2: Members (depends on syndicate → tableId)
    const tableId = syndicateQuery.data?.members_table_id;

    const membersQuery = useQuery({
        queryKey: ['syndicate-members', syndicateId, tableId],
        queryFn: () => fetchMembers(tableId!),
        enabled: !!tableId,
        staleTime: 30_000,
        retry: 2,
    });

    return {
        syndicate: syndicateQuery.data ?? null,
        members: membersQuery.data ?? [],
        isLoading: syndicateQuery.isLoading || (syndicateQuery.isSuccess && membersQuery.isLoading),
        error: syndicateQuery.error || membersQuery.error,
        refetch: () => {
            syndicateQuery.refetch();
            membersQuery.refetch();
        },
    };
}
