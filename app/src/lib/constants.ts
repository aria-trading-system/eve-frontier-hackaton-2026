// OBP Contract constants — Utopia IDs from .env

export const NETWORK = import.meta.env.VITE_NETWORK || 'testnet';

export const RPC_URL =
    import.meta.env.VITE_RPC_URL || 'https://fullnode.testnet.sui.io:443';

// OBP Package
export const PACKAGE_ID =
    import.meta.env.VITE_PACKAGE_ID || '0x7927bfcf73d3cc18e3095d757ffb160fe1f9f16f6ee54cb5a3f1d66405e9091b';
export const EXTENSION_CONFIG_ID =
    import.meta.env.VITE_EXTENSION_CONFIG_ID || '0x1ac04608ceab109550cf6325e7ef0d12473a61f341d80bc9b40128afb031aa14';
export const ADMIN_CAP_ID =
    import.meta.env.VITE_ADMIN_CAP_ID || '0x915de4b1b074f4a0f2a3426c2c308378419fce6cacdafd2dd1fc8bec4bf80c9a';

// World Package (for character borrow_owner_cap)
export const WORLD_PACKAGE_ID =
    import.meta.env.VITE_WORLD_PACKAGE_ID || '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75';

// Sui system objects
export const CLOCK_OBJECT_ID = '0x6';

// Move module names (must match contract)
export const MOD_SYNDICATE   = 'syndicate';
export const MOD_CONTRIBUTION = 'contribution';
export const MOD_GATE_POLICY = 'gate_policy';
export const MOD_CONFIG      = 'config';

// Access modes (must match gate_policy.move)
export const MODE_MEMBERS_ONLY = 0;
export const MODE_TOLL_GATE    = 1;
export const MODE_MEMBERS_FREE = 2;
export const MODE_OPEN_GATE    = 3;

export const MODE_LABELS: Record<number, string> = {
    [MODE_MEMBERS_ONLY]: 'Members Only',
    [MODE_TOLL_GATE]:    'Toll Gate',
    [MODE_MEMBERS_FREE]: 'Members Free',
    [MODE_OPEN_GATE]:    'Open Gate',
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
