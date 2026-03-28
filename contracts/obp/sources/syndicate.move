/// OBP Syndicate — onchain player organization.
///
/// A Syndicate is a shared object representing a player group.
/// It tracks membership, roles, a SUI treasury, member contribution scores,
/// and configurable entry requirements.
/// Gate access logic (gate_policy.move) reads Syndicate membership
/// to decide who gets a JumpPermit.
module obp::syndicate;

use obp::contribution::{Self, ContributionRecord};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::table::{Self, Table};
use std::string::String;
use world::character::Character;

// === Errors ===
#[error(code = 0)]
const ENotMember: vector<u8> = b"Address is not a Syndicate member";
#[error(code = 1)]
const EAlreadyMember: vector<u8> = b"Address is already a Syndicate member";
#[error(code = 2)]
const ENotAuthorized: vector<u8> = b"Not authorized (owner or officer required)";
#[error(code = 3)]
const EInviteOnly: vector<u8> = b"Syndicate is invite-only";
#[error(code = 4)]
const EInsufficientFunds: vector<u8> = b"Insufficient treasury balance";
#[error(code = 5)]
const ECannotKickOwner: vector<u8> = b"Cannot kick the Syndicate owner";
#[error(code = 6)]
const ERequirementNotMet: vector<u8> = b"Character does not meet entry requirements";
#[error(code = 7)]
const ENoContributions: vector<u8> = b"No contributions recorded — cannot distribute";
#[error(code = 8)]
const EWrongSyndicate: vector<u8> = b"ContributionRecord belongs to a different Syndicate";
#[error(code = 9)]
const ERecipientNotMember: vector<u8> = b"Recipient address is not a Syndicate member";

// === Roles ===
const ROLE_MEMBER: u8 = 0;
const ROLE_OFFICER: u8 = 1;
const ROLE_OWNER: u8 = 2;

// === Structs ===

public struct Syndicate has key {
    id: UID,
    name: String,
    invite_only: bool,
    member_count: u64,
    members: Table<address, MemberInfo>,
    treasury: Balance<sui::sui::SUI>,
    created_at: u64,
    total_contribution_score: u64,
    entry_requirements: EntryRequirements,
}

public struct MemberInfo has store, drop {
    role: u8,
    joined_at: u64,
    invited_by: address,
    contribution_score: u64,
}

/// Configurable requirements for joining a Syndicate.
/// Fields are Option — None means "no requirement" (skip check).
public struct EntryRequirements has store, copy, drop {
    required_tribe_id: Option<u32>,   // ✅ world::character::tribe() available now
    min_memories: Option<u64>,        // 🔜 TODO: when SDK exposes Memories
    required_crown: Option<String>,   // 🔜 TODO: when SDK exposes Crowns
}

/// Owned by Syndicate creator. Required for admin actions.
public struct SyndicateOwnerCap has key, store {
    id: UID,
    syndicate_id: ID,
}

// === Events ===

public struct SyndicateCreatedEvent has copy, drop {
    syndicate_id: ID,
    name: String,
    owner: address,
}

public struct MemberJoinedEvent has copy, drop {
    syndicate_id: ID,
    member: address,
    role: u8,
}

public struct MemberKickedEvent has copy, drop {
    syndicate_id: ID,
    member: address,
}

public struct TreasuryDistributedEvent has copy, drop {
    syndicate_id: ID,
    amount: u64,
    recipient_count: u64,
}

// === Create ===

public fun create_syndicate(
    name: String,
    invite_only: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): SyndicateOwnerCap {
    let sender = ctx.sender();
    let mut syndicate = Syndicate {
        id: object::new(ctx),
        name,
        invite_only,
        member_count: 1,
        members: table::new(ctx),
        treasury: balance::zero(),
        created_at: clock.timestamp_ms(),
        total_contribution_score: 0,
        entry_requirements: EntryRequirements {
            required_tribe_id: option::none(),
            min_memories: option::none(),
            required_crown: option::none(),
        },
    };

    // Owner is the first member
    syndicate.members.add(sender, MemberInfo {
        role: ROLE_OWNER,
        joined_at: clock.timestamp_ms(),
        invited_by: sender,
        contribution_score: 0,
    });

    let cap = SyndicateOwnerCap {
        id: object::new(ctx),
        syndicate_id: object::id(&syndicate),
    };

    event::emit(SyndicateCreatedEvent {
        syndicate_id: object::id(&syndicate),
        name: syndicate.name,
        owner: sender,
    });

    transfer::share_object(syndicate);
    cap
}

// === Membership — Owner/Officer actions ===

public fun invite_member(
    syndicate: &mut Syndicate,
    cap: &SyndicateOwnerCap,
    member: address,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    assert!(!syndicate.members.contains(member), EAlreadyMember);

    syndicate.members.add(member, MemberInfo {
        role: ROLE_MEMBER,
        joined_at: clock.timestamp_ms(),
        invited_by: ctx.sender(),
        contribution_score: 0,
    });
    syndicate.member_count = syndicate.member_count + 1;

    event::emit(MemberJoinedEvent {
        syndicate_id: object::id(syndicate),
        member,
        role: ROLE_MEMBER,
    });
}

public fun kick_member(
    syndicate: &mut Syndicate,
    cap: &SyndicateOwnerCap,
    member: address,
) {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    assert!(syndicate.members.contains(member), ENotMember);

    let info = syndicate.members.borrow(member);
    assert!(info.role != ROLE_OWNER, ECannotKickOwner);

    // Remove contribution score from total before removing member
    let score = syndicate.members.borrow(member).contribution_score;
    syndicate.total_contribution_score = syndicate.total_contribution_score - score;

    syndicate.members.remove(member);
    syndicate.member_count = syndicate.member_count - 1;

    event::emit(MemberKickedEvent {
        syndicate_id: object::id(syndicate),
        member,
    });
}

public fun promote_to_officer(
    syndicate: &mut Syndicate,
    cap: &SyndicateOwnerCap,
    member: address,
) {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    assert!(syndicate.members.contains(member), ENotMember);

    let info = syndicate.members.borrow_mut(member);
    info.role = ROLE_OFFICER;
}

// === Membership — Self-service ===

/// Join a public Syndicate. Checks EntryRequirements if configured.
public fun join_syndicate(
    syndicate: &mut Syndicate,
    character: &Character,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!syndicate.invite_only, EInviteOnly);
    let sender = ctx.sender();
    assert!(!syndicate.members.contains(sender), EAlreadyMember);

    check_entry_requirements(&syndicate.entry_requirements, character);

    syndicate.members.add(sender, MemberInfo {
        role: ROLE_MEMBER,
        joined_at: clock.timestamp_ms(),
        invited_by: sender,
        contribution_score: 0,
    });
    syndicate.member_count = syndicate.member_count + 1;

    event::emit(MemberJoinedEvent {
        syndicate_id: object::id(syndicate),
        member: sender,
        role: ROLE_MEMBER,
    });
}

public fun leave_syndicate(
    syndicate: &mut Syndicate,
    ctx: &TxContext,
) {
    let sender = ctx.sender();
    assert!(syndicate.members.contains(sender), ENotMember);

    let info = syndicate.members.borrow(sender);
    assert!(info.role != ROLE_OWNER, ECannotKickOwner);

    let score = syndicate.members.borrow(sender).contribution_score;
    syndicate.total_contribution_score = syndicate.total_contribution_score - score;

    syndicate.members.remove(sender);
    syndicate.member_count = syndicate.member_count - 1;
}

// === Entry Requirements ===

public fun set_entry_requirements(
    syndicate: &mut Syndicate,
    cap: &SyndicateOwnerCap,
    required_tribe_id: Option<u32>,
    min_memories: Option<u64>,
    required_crown: Option<String>,
) {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    syndicate.entry_requirements = EntryRequirements {
        required_tribe_id,
        min_memories,
        required_crown,
    };
}

/// Internal: check that character meets entry requirements.
fun check_entry_requirements(
    requirements: &EntryRequirements,
    character: &Character,
) {
    // Tribe check — available in current SDK
    if (requirements.required_tribe_id.is_some()) {
        let required = *requirements.required_tribe_id.borrow();
        assert!(character.tribe() == required, ERequirementNotMet);
    };
    // min_memories: TODO when SDK exposes Character.memories
    // required_crown: TODO when SDK exposes Character.crowns
}

// === Contributions ===

/// Record a member's contribution at market value.
/// Officer or owner approves. Updates member's contribution_score.
public fun record_contribution(
    syndicate: &mut Syndicate,
    record: &mut ContributionRecord,
    cap: &SyndicateOwnerCap,
    contributor: address,
    resource_type: String,
    quantity: u64,
    market_price_per_unit: u64,
    notes: String,
    clock: &Clock,
    _ctx: &mut TxContext,
) {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    assert!(syndicate.members.contains(contributor), ENotMember);
    assert!(contribution::syndicate_id(record) == object::id(syndicate), EWrongSyndicate);

    let (_entry_id, total_value) = contribution::add_entry(
        record,
        object::id(syndicate),
        contributor,
        resource_type,
        quantity,
        market_price_per_unit,
        notes,
        clock,
    );

    // Update member score and syndicate total
    syndicate.members.borrow_mut(contributor).contribution_score =
        syndicate.members.borrow(contributor).contribution_score + total_value;
    syndicate.total_contribution_score = syndicate.total_contribution_score + total_value;
}

/// Distribute `amount` MIST from treasury proportionally to all members
/// based on their contribution_score.
/// Caller provides the full list of member addresses (Table is not iterable).
/// Dust from integer division stays in treasury.
public fun distribute_treasury(
    syndicate: &mut Syndicate,
    cap: &SyndicateOwnerCap,
    recipients: vector<address>,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    assert!(syndicate.treasury.value() >= amount, EInsufficientFunds);
    assert!(syndicate.total_contribution_score > 0, ENoContributions);

    let total_score = syndicate.total_contribution_score;
    let amount128 = amount as u128;
    let total_score128 = total_score as u128;

    let mut i = 0;
    let n = recipients.length();
    while (i < n) {
        let addr = recipients[i];
        assert!(syndicate.members.contains(addr), ERecipientNotMember);

        let member_score = syndicate.members.borrow(addr).contribution_score;
        if (member_score > 0) {
            // share = amount × member_score / total_score (u128 intermediate)
            let share = ((amount128 * (member_score as u128)) / total_score128) as u64;
            if (share > 0) {
                let payout = coin::from_balance(syndicate.treasury.split(share), ctx);
                transfer::public_transfer(payout, addr);
            };
        };
        i = i + 1;
    };

    event::emit(TreasuryDistributedEvent {
        syndicate_id: object::id(syndicate),
        amount,
        recipient_count: n,
    });
}

/// Returns member's share in basis points (×10000 = 100%).
/// E.g. 5000 = 50%.
public fun member_share_bps(syndicate: &Syndicate, addr: address): u64 {
    if (!syndicate.members.contains(addr)) return 0;
    if (syndicate.total_contribution_score == 0) return 0;

    let score = syndicate.members.borrow(addr).contribution_score;
    ((score as u128) * 10000 / (syndicate.total_contribution_score as u128)) as u64
}

// === Treasury ===

public fun deposit(
    syndicate: &mut Syndicate,
    payment: Coin<sui::sui::SUI>,
) {
    syndicate.treasury.join(payment.into_balance());
}

public fun withdraw(
    syndicate: &mut Syndicate,
    cap: &SyndicateOwnerCap,
    amount: u64,
    ctx: &mut TxContext,
): Coin<sui::sui::SUI> {
    assert!(cap.syndicate_id == object::id(syndicate), ENotAuthorized);
    assert!(syndicate.treasury.value() >= amount, EInsufficientFunds);

    coin::from_balance(syndicate.treasury.split(amount), ctx)
}

public(package) fun deposit_balance(
    syndicate: &mut Syndicate,
    payment: Balance<sui::sui::SUI>,
) {
    syndicate.treasury.join(payment);
}

// === View ===

public fun is_member(syndicate: &Syndicate, addr: address): bool {
    syndicate.members.contains(addr)
}

public fun member_role(syndicate: &Syndicate, addr: address): u8 {
    syndicate.members.borrow(addr).role
}

public fun member_count(syndicate: &Syndicate): u64 {
    syndicate.member_count
}

public fun member_contribution_score(syndicate: &Syndicate, addr: address): u64 {
    if (!syndicate.members.contains(addr)) return 0;
    syndicate.members.borrow(addr).contribution_score
}

public fun total_contribution_score(syndicate: &Syndicate): u64 {
    syndicate.total_contribution_score
}

public fun treasury_balance(syndicate: &Syndicate): u64 {
    syndicate.treasury.value()
}

public fun name(syndicate: &Syndicate): String {
    syndicate.name
}

public fun invite_only(syndicate: &Syndicate): bool {
    syndicate.invite_only
}

public fun entry_requirements(syndicate: &Syndicate): &EntryRequirements {
    &syndicate.entry_requirements
}

public fun syndicate_id(cap: &SyndicateOwnerCap): ID {
    cap.syndicate_id
}
