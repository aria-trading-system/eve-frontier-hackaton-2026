/**
 * useCharacter — resolves Character Object ID from wallet address.
 *
 * Strategy:
 *   1. suix_getOwnedObjects(walletAddress, PlayerProfile type) → character_id
 *   2. PlayerProfile is a wallet-owned object created by CCP when character is registered
 *   3. character_id points to the shared Character object on chain
 *
 * Used by useConfigureGate and any hook that needs borrow_owner_cap<T>.
 * Same JSON-RPC pattern as useOwnedSyndicates.
 */
import { useQuery } from '@tanstack/react-query';
import { RPC_URL, WORLD_PACKAGE_ID } from '../lib/constants';

// --- Types ---

export interface CharacterData {
    characterObjectId: string;
    playerProfileId: string;
}

// --- Fetcher ---

async function fetchCharacter(walletAddress: string): Promise<CharacterData | null> {
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_getOwnedObjects',
            params: [
                walletAddress,
                {
                    filter: {
                        StructType: `${WORLD_PACKAGE_ID}::character::PlayerProfile`,
                    },
                    options: { showContent: true },
                },
                null,
                10,
            ],
        }),
    });

    const data = await response.json();
    const objects = data?.result?.data ?? [];

    if (objects.length === 0) return null;

    // Take first PlayerProfile (one character per wallet in EVE Frontier)
    const profile = objects[0];
    const profileId = profile?.data?.objectId;
    const characterId = profile?.data?.content?.fields?.character_id;

    if (!profileId || !characterId) return null;

    return {
        characterObjectId: characterId,
        playerProfileId: profileId,
    };
}

// --- Hook ---

export function useCharacter(walletAddress: string | undefined) {
    const query = useQuery({
        queryKey: ['character', walletAddress],
        queryFn: () => fetchCharacter(walletAddress!),
        enabled: !!walletAddress,
        staleTime: 120_000, // Character doesn't change often
        retry: 2,
    });

    return {
        character: query.data ?? null,
        characterObjectId: query.data?.characterObjectId ?? null,
        isLoading: query.isLoading,
        error: query.error,
    };
}
