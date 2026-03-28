/// OBP Contribution — tracks member contributions at market value.
///
/// Each Syndicate has one ContributionRecord (shared object).
/// Officers record contributions manually: resource type, quantity,
/// and market price per unit at time of delivery.
/// contribution_score accumulates in MIST-equivalent units.
/// Used by syndicate.move to distribute treasury proportionally.
module obp::contribution;

use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};
use std::string::String;

// === Errors ===
#[error(code = 0)]
const EWrongSyndicate: vector<u8> = b"ContributionRecord belongs to a different Syndicate";
#[error(code = 1)]
const EEntryNotFound: vector<u8> = b"Contribution entry not found";

// === Structs ===

/// One ContributionRecord per Syndicate.
/// Stores all contribution entries keyed by auto-incrementing entry_id.
public struct ContributionRecord has key {
    id: UID,
    syndicate_id: ID,
    entries: Table<u64, ContributionEntry>,
    next_entry_id: u64,
}

/// A single contribution event recorded by an officer.
public struct ContributionEntry has store, copy, drop {
    contributor: address,
    resource_type: String,         // e.g. "building_foam", "salt", "water_ice"
    quantity: u64,
    market_price_per_unit: u64,    // in MIST at time of recording
    total_value: u64,              // quantity × market_price_per_unit
    timestamp: u64,
    notes: String,
}

// === Events ===

public struct ContributionRecordedEvent has copy, drop {
    syndicate_id: ID,
    entry_id: u64,
    contributor: address,
    resource_type: String,
    total_value: u64,
}

// === Init ===

/// Called once when a Syndicate is created.
/// Returns a shared ContributionRecord tied to that Syndicate.
public fun init_contribution_record(
    syndicate_id: ID,
    ctx: &mut TxContext,
): ContributionRecord {
    ContributionRecord {
        id: object::new(ctx),
        syndicate_id,
        entries: table::new(ctx),
        next_entry_id: 0,
    }
}

// === Share ===

/// Share the ContributionRecord as a shared object.
/// Called once after init_contribution_record.
public fun share(record: ContributionRecord) {
    transfer::share_object(record);
}

// === Record ===

/// Add a new contribution entry.
/// Caller must pass the correct ContributionRecord for this Syndicate.
/// Returns (entry_id, total_value) so syndicate.move can update member score.
public(package) fun add_entry(
    record: &mut ContributionRecord,
    syndicate_id: ID,
    contributor: address,
    resource_type: String,
    quantity: u64,
    market_price_per_unit: u64,
    notes: String,
    clock: &Clock,
): (u64, u64) {
    assert!(record.syndicate_id == syndicate_id, EWrongSyndicate);

    // u128 intermediate to avoid overflow on large quantities × prices
    let total_value = (((quantity as u128) * (market_price_per_unit as u128)) as u64);

    let entry_id = record.next_entry_id;
    record.entries.add(entry_id, ContributionEntry {
        contributor,
        resource_type,
        quantity,
        market_price_per_unit,
        total_value,
        timestamp: clock.timestamp_ms(),
        notes,
    });
    record.next_entry_id = entry_id + 1;

    event::emit(ContributionRecordedEvent {
        syndicate_id,
        entry_id,
        contributor,
        resource_type: record.entries.borrow(entry_id).resource_type,
        total_value,
    });

    (entry_id, total_value)
}

// === View ===

public fun syndicate_id(record: &ContributionRecord): ID {
    record.syndicate_id
}

public fun entry_count(record: &ContributionRecord): u64 {
    record.next_entry_id
}

public fun get_entry(record: &ContributionRecord, entry_id: u64): &ContributionEntry {
    assert!(record.entries.contains(entry_id), EEntryNotFound);
    record.entries.borrow(entry_id)
}

public fun entry_contributor(entry: &ContributionEntry): address { entry.contributor }
public fun entry_resource_type(entry: &ContributionEntry): String { entry.resource_type }
public fun entry_quantity(entry: &ContributionEntry): u64 { entry.quantity }
public fun entry_market_price(entry: &ContributionEntry): u64 { entry.market_price_per_unit }
public fun entry_total_value(entry: &ContributionEntry): u64 { entry.total_value }
public fun entry_timestamp(entry: &ContributionEntry): u64 { entry.timestamp }
public fun entry_notes(entry: &ContributionEntry): String { entry.notes }
