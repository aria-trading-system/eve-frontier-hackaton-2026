/**
 * useAllSyndicates — discover syndicates via SyndicateCreatedEvent.
 *
 * Queries on-chain events to find all syndicates created with the current PACKAGE_ID.
 * Returns list of { syndicateId, name, owner } for the Explore page.
 *
 * Uses SuiJsonRpcClient (not SuiGrpcClient) because queryEvents is JSON-RPC only.
 */
import { useQuery } from '@tanstack/react-query';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { RPC_URL, PACKAGE_ID, MOD_SYNDICATE } from '../lib/constants';

const jsonClient = new SuiJsonRpcClient({ network: 'testnet', url: RPC_URL });
const grpcClient = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });

export interface SyndicateListItem {
    syndicateId: string;
    name: string;
    owner: string;
    memberCount: number;
    inviteOnly: boolean;
    treasuryBalance: number;
}

async function fetchAllSyndicates(): Promise<SyndicateListItem[]> {
    const eventType = `${PACKAGE_ID}::${MOD_SYNDICATE}::SyndicateCreatedEvent`;

    const response = await jsonClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 50,
        order: 'descending',
    });

    if (!response.data || response.data.length === 0) return [];

    // For each event, fetch live syndicate data
    const syndicates: SyndicateListItem[] = [];

    for (const event of response.data) {
        const parsed = event.parsedJson as any;
        if (!parsed) continue;

        const syndicateId = parsed.syndicate_id;

        // Try to fetch live object data for member count + treasury
        try {
            const objResponse = await grpcClient.getObject({
                objectId: syndicateId,
                include: { json: true },
            });

            const json = (objResponse as any)?.object?.json;
            if (!json) {
                // Object might have been deleted or inaccessible
                syndicates.push({
                    syndicateId,
                    name: parsed.name || 'Unknown',
                    owner: parsed.owner || '',
                    memberCount: 0,
                    inviteOnly: false,
                    treasuryBalance: 0,
                });
                continue;
            }

            // Count members from dynamic fields
            let memberCount = 1; // owner is always member
            try {
                const fields = await grpcClient.listDynamicFields({
                    parentId: syndicateId,
                    limit: 50,
                });
                const dynFields = (fields as any)?.dynamicFields;
                if (Array.isArray(dynFields)) {
                    // membership fields have type containing "MemberKey"
                    memberCount = dynFields.filter((f: any) =>
                        (f.name?.type || '').includes('MemberKey')
                    ).length;
                    if (memberCount === 0) memberCount = 1; // at least owner
                }
            } catch {
                // ignore — default to 1
            }

            syndicates.push({
                syndicateId,
                name: json.name || parsed.name || 'Unknown',
                owner: parsed.owner || '',
                memberCount,
                inviteOnly: json.invite_only === true || json.invite_only === 'true',
                treasuryBalance: parseInt(json.treasury ?? '0', 10),
            });
        } catch {
            // If object fetch fails, use event data only
            syndicates.push({
                syndicateId,
                name: parsed.name || 'Unknown',
                owner: parsed.owner || '',
                memberCount: 0,
                inviteOnly: false,
                treasuryBalance: 0,
            });
        }
    }

    return syndicates;
}

export function useAllSyndicates() {
    const query = useQuery({
        queryKey: ['all-syndicates', PACKAGE_ID],
        queryFn: fetchAllSyndicates,
        staleTime: 60_000,
        retry: 2,
    });

    return {
        syndicates: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}
