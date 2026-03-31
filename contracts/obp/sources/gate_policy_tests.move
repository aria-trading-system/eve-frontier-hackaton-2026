#[test_only]
module obp::gate_policy_tests;

use obp::config::{Self, ExtensionConfig};
use obp::gate_policy;
use obp::syndicate::{Self, Syndicate};

use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};

use world::access::{AdminACL, OwnerCap, ServerAddressRegistry};
use world::character::{Self, Character};
use world::energy::EnergyConfig;
use world::gate::{Self, Gate, GateConfig};
use world::network_node::{Self, NetworkNode};
use world::object_registry::ObjectRegistry;
use world::test_helpers::{
    Self,
    admin,
    governor,
    tenant,
    user_a,
    user_b,
};

// === Constants ===
const GATE_TYPE_ID: u64 = 8888;
const GATE_ITEM_ID_1: u64 = 7001;
const GATE_ITEM_ID_2: u64 = 7002;
const NWN_TYPE_ID: u64   = 111000;
const NWN_ITEM_ID: u64   = 5000;
const FUEL_MAX_CAPACITY: u64     = 1000;
const FUEL_BURN_RATE_IN_MS: u64  = 3_600_000;
const MAX_PRODUCTION: u64        = 100;
const FUEL_TYPE_ID: u64  = 1;
const FUEL_VOLUME: u64   = 10;

const TOLL_FEE: u64     = 50;
const EXPIRY_MS: u64    = 60_000;

const TRIBE_ALPHA: u32 = 100;
const TRIBE_BETA: u32  = 200;

// === World + OBP setup ===

fun setup_world_and_obp(ts: &mut Scenario) {
    // World init
    test_helpers::setup_world(ts);
    test_helpers::configure_fuel(ts);
    test_helpers::configure_assembly_energy(ts);
    test_helpers::register_server_address(ts);

    ts::next_tx(ts, governor());
    gate::init_for_testing(ts.ctx());

    // Gate type config
    ts::next_tx(ts, admin());
    {
        let admin_acl = ts::take_shared<AdminACL>(ts);
        let mut gate_config = ts::take_shared<GateConfig>(ts);
        gate::set_max_distance(&mut gate_config, &admin_acl, GATE_TYPE_ID, 1_000_000_000, ts.ctx());
        ts::return_shared(gate_config);
        ts::return_shared(admin_acl);
    };

    // OBP init — AdminCap goes to user_a (same as character owner)
    ts::next_tx(ts, user_a());
    config::init_for_testing(ts.ctx());
}

fun create_character(ts: &mut Scenario, user: address, item_id: u32): ID {
    create_character_with_tribe(ts, user, item_id, TRIBE_ALPHA)
}

fun create_character_with_tribe(ts: &mut Scenario, user: address, item_id: u32, tribe_id: u32): ID {
    ts::next_tx(ts, admin());
    let admin_acl = ts::take_shared<AdminACL>(ts);
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let character = character::create_character(
        &mut registry,
        &admin_acl,
        item_id,
        tenant(),
        tribe_id,
        user,
        string::utf8(b"pilot"),
        ts.ctx(),
    );
    let id = object::id(&character);
    character.share_character(&admin_acl, ts.ctx());
    ts::return_shared(registry);
    ts::return_shared(admin_acl);
    id
}

fun create_network_node(ts: &mut Scenario, char_id: ID): ID {
    ts::next_tx(ts, admin());
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let character = ts::take_shared_by_id<Character>(ts, char_id);
    let admin_acl = ts::take_shared<AdminACL>(ts);
    let nwn = network_node::anchor(
        &mut registry,
        &character,
        &admin_acl,
        NWN_ITEM_ID,
        NWN_TYPE_ID,
        test_helpers::get_verified_location_hash(),
        FUEL_MAX_CAPACITY,
        FUEL_BURN_RATE_IN_MS,
        MAX_PRODUCTION,
        ts.ctx(),
    );
    let id = object::id(&nwn);
    nwn.share_network_node(&admin_acl, ts.ctx());
    ts::return_shared(character);
    ts::return_shared(registry);
    ts::return_shared(admin_acl);
    id
}

fun create_gate(ts: &mut Scenario, char_id: ID, nwn_id: ID, item_id: u64): ID {
    ts::next_tx(ts, admin());
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
    let character = ts::take_shared_by_id<Character>(ts, char_id);
    let admin_acl = ts::take_shared<AdminACL>(ts);
    let gate_obj = gate::anchor(
        &mut registry,
        &mut nwn,
        &character,
        &admin_acl,
        item_id,
        GATE_TYPE_ID,
        test_helpers::get_verified_location_hash(),
        ts.ctx(),
    );
    let id = object::id(&gate_obj);
    gate_obj.share_gate(&admin_acl, ts.ctx());
    ts::return_shared(character);
    ts::return_shared(nwn);
    ts::return_shared(registry);
    ts::return_shared(admin_acl);
    id
}

fun bring_nwn_online(ts: &mut Scenario, char_id: ID, nwn_id: ID) {
    ts::next_tx(ts, user_a());
    {
        let clk = clock::create_for_testing(ts.ctx());
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        let mut character = ts::take_shared_by_id<Character>(ts, char_id);
        let cap_id = nwn.owner_cap_id();
        let ticket = ts::receiving_ticket_by_id<OwnerCap<NetworkNode>>(cap_id);
        let (owner_cap, receipt) = character.borrow_owner_cap<NetworkNode>(ticket, ts.ctx());
        nwn.deposit_fuel_test(&owner_cap, FUEL_TYPE_ID, FUEL_VOLUME, 10, &clk);
        nwn.online(&owner_cap, &clk);
        character.return_owner_cap(owner_cap, receipt);
        ts::return_shared(nwn);
        ts::return_shared(character);
        clk.destroy_for_testing();
    };
}

fun link_and_online_gates(
    ts: &mut Scenario,
    char_id: ID,
    nwn_id: ID,
    gate_a_id: ID,
    gate_b_id: ID,
) {
    use std::bcs;
    ts::next_tx(ts, user_a());
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        let energy_config = ts::take_shared<EnergyConfig>(ts);
        let gate_config = ts::take_shared<GateConfig>(ts);
        let server_registry = ts::take_shared<ServerAddressRegistry>(ts);
        let admin_acl = ts::take_shared<AdminACL>(ts);
        let mut gate_a = ts::take_shared_by_id<Gate>(ts, gate_a_id);
        let mut gate_b = ts::take_shared_by_id<Gate>(ts, gate_b_id);
        let mut character = ts::take_shared_by_id<Character>(ts, char_id);

        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        let (cap_b, receipt_b) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_b.owner_cap_id()), ts.ctx()
        );

        let proof = test_helpers::construct_location_proof(test_helpers::get_verified_location_hash());
        let clk = clock::create_for_testing(ts.ctx());
        gate_a.link_gates(
            &mut gate_b, &gate_config, &server_registry, &admin_acl,
            &cap_a, &cap_b, bcs::to_bytes(&proof), &clk, ts.ctx(),
        );
        gate_a.online(&mut nwn, &energy_config, &cap_a);
        gate_b.online(&mut nwn, &energy_config, &cap_b);

        clk.destroy_for_testing();
        character.return_owner_cap(cap_a, receipt_a);
        character.return_owner_cap(cap_b, receipt_b);
        ts::return_shared(character);
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(nwn);
        ts::return_shared(energy_config);
        ts::return_shared(gate_config);
        ts::return_shared(server_registry);
        ts::return_shared(admin_acl);
    };
}

/// Configure OBP gate policy — permissionless via OwnerCap<Gate>.
fun configure_gate_policy(
    ts: &mut Scenario,
    char_id: ID,
    gate_a_id: ID,
    gate_b_id: ID,
    syndicate_id: ID,
    mode: u8,
    toll_fee: u64,
) {
    ts::next_tx(ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(ts);
        let syndicate = ts::take_shared_by_id<Syndicate>(ts, syndicate_id);
        let mut gate_a = ts::take_shared_by_id<Gate>(ts, gate_a_id);
        let mut gate_b = ts::take_shared_by_id<Gate>(ts, gate_b_id);
        let mut character = ts::take_shared_by_id<Character>(ts, char_id);

        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        let (cap_b, receipt_b) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_b.owner_cap_id()), ts.ctx()
        );

        // Configure source gate (sets policy + authorizes OBPAuth)
        gate_policy::configure_gate(
            &mut ext_config,
            &mut gate_a,
            &cap_a,
            &syndicate,
            mode,
            toll_fee,
            EXPIRY_MS,
        );

        // Authorize destination gate (issue_jump_permit checks both gates)
        gate_policy::configure_gate(
            &mut ext_config,
            &mut gate_b,
            &cap_b,
            &syndicate,
            mode,
            toll_fee,
            EXPIRY_MS,
        );

        character.return_owner_cap(cap_a, receipt_a);
        character.return_owner_cap(cap_b, receipt_b);
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(syndicate);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };
}

fun create_syndicate(ts: &mut Scenario, owner: address, invite_only: bool): ID {
    ts::next_tx(ts, owner);
    {
        let clk = clock::create_for_testing(ts.ctx());
        let cap = syndicate::create_syndicate(
            string::utf8(b"OBP Syndicate"),
            invite_only,
            &clk,
            ts.ctx(),
        );
        let id = syndicate::syndicate_id(&cap);
        transfer::public_transfer(cap, owner);
        clk.destroy_for_testing();
        id
    }
}

// ════════════════════════════════════════════════════════════
// EXISTING TESTS (12) — mode logic
// ════════════════════════════════════════════════════════════

#[test]
fun test_members_only_member_gets_permit() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_id = create_character(&mut ts, user_a(), 301);
    let nwn_id  = create_network_node(&mut ts, char_id);
    let gate_a_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_id, nwn_id);
    link_and_online_gates(&mut ts, char_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_id, gate_a_id, gate_b_id, syndicate_id, 0, 0);

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::gate_policy::ENotMember)]
fun test_members_only_nonmember_fails() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 302);
    let char_b_id = create_character(&mut ts, user_b(), 303);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 0, 0);

    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_toll_gate_anyone_pays_gets_permit() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 304);
    let char_b_id = create_character(&mut ts, user_b(), 305);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 1, TOLL_FEE);

    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        assert!(syndicate::treasury_balance(&syndicate) == TOLL_FEE, 0);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::gate_policy::EInsufficientPayment)]
fun test_toll_gate_insufficient_payment_fails() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 306);
    let char_b_id = create_character(&mut ts, user_b(), 307);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 1, TOLL_FEE);

    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE - 1, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_members_free_member_passes_free() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_id   = create_character(&mut ts, user_a(), 308);
    let nwn_id    = create_network_node(&mut ts, char_id);
    let gate_a_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_id, nwn_id);
    link_and_online_gates(&mut ts, char_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_id, gate_a_id, gate_b_id, syndicate_id, 2, TOLL_FEE);

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        assert!(syndicate::treasury_balance(&syndicate) == 0, 0);
        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_members_free_nonmember_pays_toll() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 309);
    let char_b_id = create_character(&mut ts, user_b(), 310);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 2, TOLL_FEE);

    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        assert!(syndicate::treasury_balance(&syndicate) == TOLL_FEE, 0);
        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_open_gate_allows_clean_address() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_id   = create_character(&mut ts, user_a(), 311);
    let nwn_id    = create_network_node(&mut ts, char_id);
    let gate_a_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_id, nwn_id);
    link_and_online_gates(&mut ts, char_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    // MODE_OPEN_GATE = 3
    configure_gate_policy(&mut ts, char_id, gate_a_id, gate_b_id, syndicate_id, 3, 0);

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::gate_policy::EBlacklisted)]
fun test_open_gate_blocks_blacklisted_address() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 312);
    let char_b_id = create_character(&mut ts, user_b(), 313);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 3, 0);

    // Add user_b to blacklist
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_to_blacklist(&mut ext_config, &gate_a, &cap_a, user_b());
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b tries to jump — should fail
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_toll_gate_change_returned_to_caller() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 314);
    let char_b_id = create_character(&mut ts, user_b(), 315);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 1, TOLL_FEE);

    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE + 100, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        assert!(syndicate::treasury_balance(&syndicate) == TOLL_FEE, 0);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::next_tx(&mut ts, user_b());
    {
        let change = ts::take_from_sender<coin::Coin<SUI>>(&ts);
        assert!(coin::value(&change) == 100, 0);
        ts::return_to_sender(&ts, change);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::gate_policy::ENoGatePolicy)]
fun test_no_gate_policy_fails() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_id   = create_character(&mut ts, user_a(), 316);
    let nwn_id    = create_network_node(&mut ts, char_id);
    let gate_a_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_id, nwn_id);
    link_and_online_gates(&mut ts, char_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_remove_from_blacklist() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 317);
    let char_b_id = create_character(&mut ts, user_b(), 318);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 3, 0);

    // Add user_b to blacklist
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_to_blacklist(&mut ext_config, &gate_a, &cap_a, user_b());
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // Remove user_b from blacklist
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::remove_from_blacklist(&mut ext_config, &gate_a, &cap_a, user_b());
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b should now pass freely
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::gate_policy::EProofRequired)]
fun test_proximity_required_proof_missing_fails() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_id   = create_character(&mut ts, user_a(), 319);
    let nwn_id    = create_network_node(&mut ts, char_id);
    let gate_a_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_id, nwn_id);
    link_and_online_gates(&mut ts, char_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_id, gate_a_id, gate_b_id, syndicate_id, 0, 0);

    // Enable proximity
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::configure_gate_proximity(
            &mut ext_config, &gate_a, &cap_a, true, 1_000_000,
        );
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        let clk = clock::create_for_testing(ts.ctx());

        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );

        clk.destroy_for_testing();
        ts::return_shared(server_registry);
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_configure_gate_proximity() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_id   = create_character(&mut ts, user_a(), 320);
    let nwn_id    = create_network_node(&mut ts, char_id);
    let gate_a_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_id, nwn_id);
    link_and_online_gates(&mut ts, char_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_id, gate_a_id, gate_b_id, syndicate_id, 0, 0);

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        assert!(!gate_policy::gate_require_proximity(&ext_config, &gate_a), 0);
        assert!(gate_policy::gate_max_distance(&ext_config, &gate_a) == 0, 1);
        ts::return_shared(gate_a);
        ts::return_shared(ext_config);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::configure_gate_proximity(
            &mut ext_config, &gate_a, &cap_a, true, 500_000,
        );
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        assert!(gate_policy::gate_require_proximity(&ext_config, &gate_a), 0);
        assert!(gate_policy::gate_max_distance(&ext_config, &gate_a) == 500_000, 1);
        ts::return_shared(gate_a);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

// ════════════════════════════════════════════════════════════
// NEW TESTS — Universal Blacklist (works across ALL modes)
// ════════════════════════════════════════════════════════════

#[test]
#[expected_failure(abort_code = obp::gate_policy::EBlacklisted)]
fun test_universal_blacklist_blocks_in_toll_gate() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 330);
    let char_b_id = create_character(&mut ts, user_b(), 331);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    // MODE_TOLL_GATE = 1 — normally anyone can pay to pass
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 1, TOLL_FEE);

    // Blacklist user_b — should block even in toll gate mode
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_to_blacklist(&mut ext_config, &gate_a, &cap_a, user_b());
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b tries to jump WITH payment — should still fail (blacklisted)
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::gate_policy::EBlacklisted)]
fun test_universal_blacklist_blocks_in_members_free() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character(&mut ts, user_a(), 332);
    let char_b_id = create_character(&mut ts, user_b(), 333);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    // MODE_MEMBERS_FREE = 2 — non-members can pay to pass
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 2, TOLL_FEE);

    // Blacklist user_b
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_to_blacklist(&mut ext_config, &gate_a, &cap_a, user_b());
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b tries to jump with payment — blocked (blacklist is universal)
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

// ════════════════════════════════════════════════════════════
// NEW TESTS — Tribe Blocking
// ════════════════════════════════════════════════════════════

#[test]
#[expected_failure(abort_code = obp::gate_policy::ETribeBlocked)]
fun test_tribe_blocked_denied() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    // user_a = tribe ALPHA (100), user_b = tribe BETA (200)
    let char_a_id = create_character_with_tribe(&mut ts, user_a(), 340, TRIBE_ALPHA);
    let char_b_id = create_character_with_tribe(&mut ts, user_b(), 341, TRIBE_BETA);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    // MODE_TOLL_GATE — normally anyone pays to pass
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 1, TOLL_FEE);

    // Block tribe BETA (200) — entire faction blocked
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_blocked_tribe(&mut ext_config, &gate_a, &cap_a, TRIBE_BETA);
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b (tribe BETA) tries to jump — should fail with ETribeBlocked
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_tribe_not_blocked_passes() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    // Both tribes exist, only BETA is blocked
    let char_a_id = create_character_with_tribe(&mut ts, user_a(), 342, TRIBE_ALPHA);
    let char_b_id = create_character_with_tribe(&mut ts, user_b(), 343, TRIBE_ALPHA);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 1, TOLL_FEE);

    // Block tribe BETA (200) — user_b is ALPHA, should NOT be blocked
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_blocked_tribe(&mut ext_config, &gate_a, &cap_a, TRIBE_BETA);
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b (tribe ALPHA) pays toll — should pass fine
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        let payment = coin::mint_for_testing<SUI>(TOLL_FEE, ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::some(payment), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        assert!(syndicate::treasury_balance(&syndicate) == TOLL_FEE, 0);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}

#[test]
fun test_add_remove_blocked_tribe() {
    let mut ts = ts::begin(governor());
    setup_world_and_obp(&mut ts);

    let char_a_id = create_character_with_tribe(&mut ts, user_a(), 344, TRIBE_ALPHA);
    let char_b_id = create_character_with_tribe(&mut ts, user_b(), 345, TRIBE_BETA);
    let nwn_id    = create_network_node(&mut ts, char_a_id);
    let gate_a_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_1);
    let gate_b_id = create_gate(&mut ts, char_a_id, nwn_id, GATE_ITEM_ID_2);
    bring_nwn_online(&mut ts, char_a_id, nwn_id);
    link_and_online_gates(&mut ts, char_a_id, nwn_id, gate_a_id, gate_b_id);

    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    configure_gate_policy(&mut ts, char_a_id, gate_a_id, gate_b_id, syndicate_id, 3, 0);

    // Block tribe BETA
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::add_blocked_tribe(&mut ext_config, &gate_a, &cap_a, TRIBE_BETA);
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // Verify blocked_tribes view returns TRIBE_BETA
    ts::next_tx(&mut ts, user_a());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let tribes = gate_policy::gate_blocked_tribes(&ext_config, &gate_a);
        assert!(tribes.length() == 1, 0);
        assert!(*tribes.borrow(0) == TRIBE_BETA, 1);
        ts::return_shared(gate_a);
        ts::return_shared(ext_config);
    };

    // Unblock tribe BETA
    ts::next_tx(&mut ts, user_a());
    {
        let mut ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let (cap_a, receipt_a) = character.borrow_owner_cap<Gate>(
            ts::receiving_ticket_by_id<OwnerCap<Gate>>(gate_a.owner_cap_id()), ts.ctx()
        );
        gate_policy::remove_blocked_tribe(&mut ext_config, &gate_a, &cap_a, TRIBE_BETA);
        character.return_owner_cap(cap_a, receipt_a);
        ts::return_shared(gate_a);
        ts::return_shared(character);
        ts::return_shared(ext_config);
    };

    // user_b (tribe BETA) can now pass
    ts::next_tx(&mut ts, user_b());
    {
        let ext_config = ts::take_shared<ExtensionConfig>(&ts);
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let gate_a = ts::take_shared_by_id<Gate>(&ts, gate_a_id);
        let gate_b = ts::take_shared_by_id<Gate>(&ts, gate_b_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());

        let server_registry = ts::take_shared<ServerAddressRegistry>(&ts);
        gate_policy::request_jump_permit(
            &ext_config, &mut syndicate, &gate_a, &gate_b, &character,
            option::none(), option::none(),
            &server_registry, gate::location(&gate_a), &clk, ts.ctx(),
        );
        ts::return_shared(server_registry);

        clk.destroy_for_testing();
        ts::return_shared(gate_a);
        ts::return_shared(gate_b);
        ts::return_shared(character);
        ts::return_shared(syndicate);
        ts::return_shared(ext_config);
    };

    ts::end(ts);
}
