/// OBP Gate Policy — connects a Syndicate to a Gate.
///
/// Gate owners configure this extension to control who gets a JumpPermit.
/// Four access modes:
///   0 = MEMBERS_ONLY   — only Syndicate members, free
///   1 = TOLL_GATE      — anyone pays toll → gets permit
///   2 = MEMBERS_FREE   — members free, non-members pay toll
///   3 = OPEN_GATE      — everyone can pass (no membership or toll required)
///
/// UNIVERSAL BLACKLIST (checked BEFORE mode logic):
///   - Address blacklist: individual addresses blocked across ALL modes
///   - Tribe blocking: entire factions blocked across ALL modes
///   These are security layers on top of access modes, like a firewall.
///
/// Optional: require_proximity = true → traveler must prove physical proximity
/// via a server-signed LocationProof before JumpPermit is issued.
#[allow(lint(self_transfer), unused_const)]
module obp::gate_policy;

use obp::config::{Self, OBPAuth, ExtensionConfig};
use obp::syndicate::Syndicate;

use sui::clock::Clock;
use sui::coin::{Self as coin, Coin};
use sui::event;
use world::access::{Self, OwnerCap, ServerAddressRegistry};
use world::character::Character;
use world::gate::{Self, Gate};
use world::location::{Self, Location};

// === Modes ===
const MODE_MEMBERS_ONLY: u8  = 0;
const MODE_TOLL_GATE: u8     = 1;
const MODE_MEMBERS_FREE: u8  = 2;
const MODE_OPEN_GATE: u8     = 3;

// === Errors ===
#[error(code = 0)]
const ENotMember: vector<u8> = b"Not a Syndicate member";
#[error(code = 1)]
const EBlacklisted: vector<u8> = b"Address is blacklisted";
#[error(code = 2)]
const EInsufficientPayment: vector<u8> = b"Insufficient payment for toll";
#[error(code = 3)]
const ENoGatePolicy: vector<u8> = b"No GatePolicy configured for this gate";
#[error(code = 4)]
const EInvalidMode: vector<u8> = b"Invalid access mode";
#[error(code = 5)]
const EPaymentNotRequired: vector<u8> = b"Payment not required for this mode/member";
#[error(code = 6)]
const EProofRequired: vector<u8> = b"LocationProof required for this gate";
#[error(code = 7)]
const EGateNotAuthorized: vector<u8> = b"OwnerCap does not match this gate";
#[error(code = 8)]
const ETribeBlocked: vector<u8> = b"Character tribe is blocked on this gate";

// === Structs ===

/// Stored as dynamic field on ExtensionConfig, keyed by gate ID.
public struct GatePolicy has store, drop {
    syndicate_id: ID,
    mode: u8,
    toll_fee: u64,               // in MIST (0 if not applicable)
    expiry_ms: u64,              // permit duration in milliseconds
    blacklist: vector<address>,  // universal — checked before mode logic
    blocked_tribes: vector<u32>, // universal — checked before mode logic
    require_proximity: bool,     // if true: traveler must submit LocationProof
    max_distance: u64,           // max distance in game units (0 = disabled)
}

/// Dynamic field key: one GatePolicy per gate.
public struct GatePolicyKey has copy, drop, store {
    gate_id: ID,
}

// === Events ===

public struct GateConfiguredEvent has copy, drop {
    gate_id: ID,
    syndicate_id: ID,
    mode: u8,
}

public struct JumpPermitIssuedEvent has copy, drop {
    gate_id: ID,
    character: address,
    paid_toll: bool,
    proximity_verified: bool,
}

// === Gate owner: configure gate (permissionless) ===

public fun configure_gate(
    extension_config: &mut ExtensionConfig,
    gate: &mut Gate,
    owner_cap: &OwnerCap<Gate>,
    syndicate: &Syndicate,
    mode: u8,
    toll_fee: u64,
    expiry_ms: u64,
) {
    assert!(mode <= MODE_OPEN_GATE, EInvalidMode);
    assert!(access::is_authorized(owner_cap, object::id(gate)), EGateNotAuthorized);

    gate::authorize_extension<OBPAuth>(gate, owner_cap);

    let gate_id = object::id(gate);

    extension_config.set_rule_open<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
        GatePolicy {
            syndicate_id: object::id(syndicate),
            mode,
            toll_fee,
            expiry_ms,
            blacklist: vector::empty(),
            blocked_tribes: vector::empty(),
            require_proximity: false,
            max_distance: 0,
        },
    );

    event::emit(GateConfiguredEvent {
        gate_id,
        syndicate_id: object::id(syndicate),
        mode,
    });
}

/// Update proximity settings on an existing GatePolicy.
public fun configure_gate_proximity(
    extension_config: &mut ExtensionConfig,
    gate: &Gate,
    owner_cap: &OwnerCap<Gate>,
    require_proximity: bool,
    max_distance: u64,
) {
    assert!(access::is_authorized(owner_cap, object::id(gate)), EGateNotAuthorized);
    let gate_id = object::id(gate);
    let policy = extension_config.borrow_rule_mut_open<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
    );
    policy.require_proximity = require_proximity;
    policy.max_distance = max_distance;
}

// === Blacklist management (universal — works with any mode) ===

/// Add address to blacklist. Works across all access modes.
public fun add_to_blacklist(
    extension_config: &mut ExtensionConfig,
    gate: &Gate,
    owner_cap: &OwnerCap<Gate>,
    addr: address,
) {
    assert!(access::is_authorized(owner_cap, object::id(gate)), EGateNotAuthorized);
    let gate_id = object::id(gate);
    let policy = extension_config.borrow_rule_mut_open<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
    );
    if (!policy.blacklist.contains(&addr)) {
        policy.blacklist.push_back(addr);
    }
}

/// Remove address from blacklist.
public fun remove_from_blacklist(
    extension_config: &mut ExtensionConfig,
    gate: &Gate,
    owner_cap: &OwnerCap<Gate>,
    addr: address,
) {
    assert!(access::is_authorized(owner_cap, object::id(gate)), EGateNotAuthorized);
    let gate_id = object::id(gate);
    let policy = extension_config.borrow_rule_mut_open<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
    );
    let (found, idx) = policy.blacklist.index_of(&addr);
    if (found) {
        policy.blacklist.remove(idx);
    }
}

// === Tribe blocking (universal — works with any mode) ===

/// Block an entire tribe/faction from passing through this gate.
public fun add_blocked_tribe(
    extension_config: &mut ExtensionConfig,
    gate: &Gate,
    owner_cap: &OwnerCap<Gate>,
    tribe_id: u32,
) {
    assert!(access::is_authorized(owner_cap, object::id(gate)), EGateNotAuthorized);
    let gate_id = object::id(gate);
    let policy = extension_config.borrow_rule_mut_open<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
    );
    if (!policy.blocked_tribes.contains(&tribe_id)) {
        policy.blocked_tribes.push_back(tribe_id);
    }
}

/// Remove a tribe from the blocked list.
public fun remove_blocked_tribe(
    extension_config: &mut ExtensionConfig,
    gate: &Gate,
    owner_cap: &OwnerCap<Gate>,
    tribe_id: u32,
) {
    assert!(access::is_authorized(owner_cap, object::id(gate)), EGateNotAuthorized);
    let gate_id = object::id(gate);
    let policy = extension_config.borrow_rule_mut_open<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
    );
    let (found, idx) = policy.blocked_tribes.index_of(&tribe_id);
    if (found) {
        policy.blocked_tribes.remove(idx);
    }
}

// === Request JumpPermit ===

public fun request_jump_permit(
    extension_config: &ExtensionConfig,
    syndicate: &mut Syndicate,
    source_gate: &Gate,
    destination_gate: &Gate,
    character: &Character,
    payment: Option<Coin<sui::sui::SUI>>,
    // Proximity: pass Some(proof_bytes) when gate has require_proximity = true.
    // Pass None when proximity is disabled (most gates).
    location_proof: Option<vector<u8>>,
    server_registry: &ServerAddressRegistry,
    gate_location: &Location,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let gate_id = object::id(source_gate);
    assert!(
        extension_config.has_rule<GatePolicyKey>(GatePolicyKey { gate_id }),
        ENoGatePolicy,
    );

    let policy = extension_config.borrow_rule<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id },
    );

    // ─── UNIVERSAL SECURITY LAYER ───
    // Blacklist + tribe check run BEFORE mode logic.
    // These are like a firewall: blocked = denied, regardless of mode.
    let caller = ctx.sender();
    assert!(!policy.blacklist.contains(&caller), EBlacklisted);
    assert!(!policy.blocked_tribes.contains(&character.tribe()), ETribeBlocked);

    // ─── PROXIMITY CHECK ───
    let proximity_verified = if (policy.require_proximity) {
        assert!(location_proof.is_some(), EProofRequired);
        location::verify_distance(
            gate_location,
            server_registry,
            *location_proof.borrow(),
            policy.max_distance,
            ctx,
        );
        true
    } else {
        // Consume the option cleanly if provided (ignore unused proof)
        if (location_proof.is_some()) {
            location_proof.destroy_some();
        } else {
            location_proof.destroy_none();
        };
        false
    };

    // ─── ACCESS MODE LOGIC ───
    let expires_at = clock.timestamp_ms() + policy.expiry_ms;
    let mut paid_toll = false;

    if (policy.mode == MODE_MEMBERS_ONLY) {
        assert!(syndicate.is_member(caller), ENotMember);
        if (payment.is_some()) {
            transfer::public_transfer(payment.destroy_some(), caller);
        } else {
            payment.destroy_none();
        };

    } else if (policy.mode == MODE_TOLL_GATE) {
        let pay_coin = payment.destroy_some();
        assert!(pay_coin.value() >= policy.toll_fee, EInsufficientPayment);
        let mut full = pay_coin.into_balance();
        let toll = full.split(policy.toll_fee);
        syndicate.deposit_balance(toll);
        if (full.value() > 0) {
            transfer::public_transfer(coin::from_balance(full, ctx), caller);
        } else {
            full.destroy_zero();
        };
        paid_toll = true;

    } else if (policy.mode == MODE_MEMBERS_FREE) {
        if (syndicate.is_member(caller)) {
            if (payment.is_some()) {
                transfer::public_transfer(payment.destroy_some(), caller);
            } else {
                payment.destroy_none();
            };
        } else {
            let pay_coin = payment.destroy_some();
            assert!(pay_coin.value() >= policy.toll_fee, EInsufficientPayment);
            let mut full = pay_coin.into_balance();
            let toll = full.split(policy.toll_fee);
            syndicate.deposit_balance(toll);
            if (full.value() > 0) {
                transfer::public_transfer(coin::from_balance(full, ctx), caller);
            } else {
                full.destroy_zero();
            };
            paid_toll = true;
        }

    } else {
        // MODE_OPEN_GATE: everyone passes (blacklist/tribe already checked above)
        if (payment.is_some()) {
            transfer::public_transfer(payment.destroy_some(), caller);
        } else {
            payment.destroy_none();
        };
    };

    gate::issue_jump_permit<OBPAuth>(
        source_gate,
        destination_gate,
        character,
        config::obp_auth(),
        expires_at,
        ctx,
    );

    event::emit(JumpPermitIssuedEvent {
        gate_id,
        character: caller,
        paid_toll,
        proximity_verified,
    });
}

// === View ===

public fun gate_mode(extension_config: &ExtensionConfig, gate: &Gate): u8 {
    extension_config.borrow_rule<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id: object::id(gate) },
    ).mode
}

public fun gate_toll_fee(extension_config: &ExtensionConfig, gate: &Gate): u64 {
    extension_config.borrow_rule<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id: object::id(gate) },
    ).toll_fee
}

public fun gate_require_proximity(extension_config: &ExtensionConfig, gate: &Gate): bool {
    extension_config.borrow_rule<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id: object::id(gate) },
    ).require_proximity
}

public fun gate_max_distance(extension_config: &ExtensionConfig, gate: &Gate): u64 {
    extension_config.borrow_rule<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id: object::id(gate) },
    ).max_distance
}

public fun gate_blocked_tribes(extension_config: &ExtensionConfig, gate: &Gate): vector<u32> {
    extension_config.borrow_rule<GatePolicyKey, GatePolicy>(
        GatePolicyKey { gate_id: object::id(gate) },
    ).blocked_tribes
}
