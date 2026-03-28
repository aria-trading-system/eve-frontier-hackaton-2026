// OBP Contract constants — Utopia IDs from .env

export const NETWORK = import.meta.env.VITE_NETWORK || 'testnet';

export const RPC_URL =
    import.meta.env.VITE_RPC_URL || 'https://fullnode.testnet.sui.io:443';

// OBP Package
export const PACKAGE_ID =
    import.meta.env.VITE_PACKAGE_ID || '0xaf2d6405edac931817a0bafabd7bbf6543681a4c18d2987440514c2598891d67';
export const EXTENSION_CONFIG_ID =
    import.meta.env.VITE_EXTENSION_CONFIG_ID || '0x211142d4d9151cf07a9c077d2ae5e34490d652155d26aa9c199be6ffdadd98dc';
export const ADMIN_CAP_ID =
    import.meta.env.VITE_ADMIN_CAP_ID || '0xdc8ab1bc8418c7a5141cdeeaf718b2bf0f11ad403ee7bb8be07ad40f7e9b8299';

// Live Syndicate (created Session 033)
export const SYNDICATE_ID =
    import.meta.env.VITE_SYNDICATE_ID || '0xb2d454b5d057201bf024284a1211b68bdad173b25140a5c59f4c9999fcacd8dc';
export const CONTRIBUTION_RECORD_ID =
    import.meta.env.VITE_CONTRIBUTION_RECORD_ID || '0x8e0021265a0d8162c776b3e5f67648f6bd0a9c86772d03aec1638b7f00a8c6d4';
export const SYNDICATE_OWNER_CAP_ID =
    import.meta.env.VITE_SYNDICATE_OWNER_CAP_ID || '0x114a57f24d44e1b273ca6865707646a59ab415aa0358251ceb8da7bade3385a7';

// World Package (for character borrow_owner_cap)
export const WORLD_PACKAGE_ID =
    import.meta.env.VITE_WORLD_PACKAGE_ID || '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75';

// Gate objects (Session 034)
export const GATE_OBJECT_ID_1 =
    import.meta.env.VITE_GATE_OBJECT_ID_1 || '0xfdd055c965c58a02e9a5480271a973e90168d2fb07bcca45055570a03690a505';
export const GATE_OBJECT_ID_2 =
    import.meta.env.VITE_GATE_OBJECT_ID_2 || '0xb1c6f3bcade962dfc6f0c4fa72ea23274d543a1636e299614d509da2fdc99639';
export const GATE_OWNER_CAP_1 =
    import.meta.env.VITE_GATE_OWNER_CAP_1 || '0x9d8c080f37e14388fc42da543d1cb5c2a4fc1c0fe0e156907bed1e2d0896cb57';

// Sui system objects
export const CLOCK_OBJECT_ID = '0x6';

// Move module names (must match contract)
export const MOD_SYNDICATE = 'syndicate';
export const MOD_CONTRIBUTION = 'contribution';
export const MOD_GATE_POLICY = 'gate_policy';
export const MOD_CONFIG = 'config';

// Access modes (must match gate_policy.move)
export const MODE_MEMBERS_ONLY = 0;
export const MODE_TOLL_GATE    = 1;
export const MODE_MEMBERS_FREE = 2;
export const MODE_BLACKLIST    = 3;

export const MODE_LABELS: Record<number, string> = {
    [MODE_MEMBERS_ONLY]: 'Members Only',
    [MODE_TOLL_GATE]:    'Toll Gate',
    [MODE_MEMBERS_FREE]: 'Members Free',
    [MODE_BLACKLIST]:    'Blacklist',
};

// Roles (must match syndicate.move)
export const ROLE_MEMBER  = 0;
export const ROLE_OFFICER = 1;
export const ROLE_OWNER   = 2;

export const ROLE_LABELS: Record<number, string> = {
    [ROLE_MEMBER]:  'Member',
    [ROLE_OFFICER]: 'Officer',
    [ROLE_OWNER]:   'Owner',
};
