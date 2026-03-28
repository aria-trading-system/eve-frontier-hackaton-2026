#[test_only]
module obp::syndicate_tests;

use obp::syndicate::{Self, Syndicate, SyndicateOwnerCap};
use obp::contribution::{Self, ContributionRecord};
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};
use world::access::AdminACL;
use world::character::{Self, Character};
use world::object_registry::ObjectRegistry;
use world::test_helpers::{Self, admin, governor, tenant, user_a, user_b};

// === Helpers ===

fun setup_world(ts: &mut Scenario) {
    test_helpers::setup_world(ts);
    test_helpers::configure_fuel(ts);
    test_helpers::configure_assembly_energy(ts);
    test_helpers::register_server_address(ts);
}

fun create_character(ts: &mut Scenario, user: address, item_id: u32): ID {
    ts::next_tx(ts, admin());
    let admin_acl = ts::take_shared<AdminACL>(ts);
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let character = character::create_character(
        &mut registry,
        &admin_acl,
        item_id,
        tenant(),
        100,
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

fun create_syndicate(ts: &mut Scenario, owner: address, invite_only: bool): ID {
    ts::next_tx(ts, owner);
    let clk = clock::create_for_testing(ts.ctx());
    let cap = syndicate::create_syndicate(
        string::utf8(b"Test Syndicate"),
        invite_only,
        &clk,
        ts.ctx(),
    );
    let id = syndicate::syndicate_id(&cap);
    transfer::public_transfer(cap, owner);
    clk.destroy_for_testing();
    id
}

// === Tests ===

#[test]
fun test_create_syndicate_owner_is_member() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        assert!(syndicate::is_member(&syndicate, user_a()), 0);
        assert!(syndicate::member_count(&syndicate) == 1, 1);
        assert!(syndicate::member_role(&syndicate, user_a()) == 2, 2); // ROLE_OWNER
        ts::return_shared(syndicate);
    };

    ts::end(ts);
}

#[test]
fun test_join_open_syndicate() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 201);

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        assert!(syndicate::is_member(&syndicate, user_b()), 0);
        assert!(syndicate::member_count(&syndicate) == 2, 1);
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::syndicate::EInviteOnly)]
fun test_join_invite_only_fails() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), true); // invite_only
    let char_b_id = create_character(&mut ts, user_b(), 202);

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    ts::end(ts);
}

#[test]
fun test_invite_member() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::invite_member(&mut syndicate, &cap, user_b(), &clk, ts.ctx());
        assert!(syndicate::is_member(&syndicate, user_b()), 0);
        assert!(syndicate::member_count(&syndicate) == 2, 1);
        clk.destroy_for_testing();
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
fun test_kick_member() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 203);

    // user_b joins
    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    // user_a kicks user_b
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        syndicate::kick_member(&mut syndicate, &cap, user_b());
        assert!(!syndicate::is_member(&syndicate, user_b()), 0);
        assert!(syndicate::member_count(&syndicate) == 1, 1);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::syndicate::ECannotKickOwner)]
fun test_cannot_kick_owner() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        syndicate::kick_member(&mut syndicate, &cap, user_a()); // should abort
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
fun test_promote_to_officer() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 204);

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        syndicate::promote_to_officer(&mut syndicate, &cap, user_b());
        assert!(syndicate::member_role(&syndicate, user_b()) == 1, 0); // ROLE_OFFICER
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
fun test_leave_syndicate() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 205);

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        syndicate::leave_syndicate(&mut syndicate, ts.ctx());
        assert!(!syndicate::is_member(&syndicate, user_b()), 0);
        assert!(syndicate::member_count(&syndicate) == 1, 1);
        ts::return_shared(syndicate);
    };

    ts::end(ts);
}

#[test]
fun test_treasury_deposit_and_withdraw() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let payment = coin::mint_for_testing<SUI>(100, ts.ctx());
        syndicate::deposit(&mut syndicate, payment);
        assert!(syndicate::treasury_balance(&syndicate) == 100, 0);
        ts::return_shared(syndicate);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let coin = syndicate::withdraw(&mut syndicate, &cap, 40, ts.ctx());
        assert!(syndicate::treasury_balance(&syndicate) == 60, 0);
        assert!(coin::value(&coin) == 40, 1);
        transfer::public_transfer(coin, user_a());
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = obp::syndicate::EInsufficientFunds)]
fun test_withdraw_insufficient_funds_fails() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let coin = syndicate::withdraw(&mut syndicate, &cap, 999, ts.ctx());
        transfer::public_transfer(coin, user_a());
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

// === Contribution tests ===

#[test]
fun test_record_contribution_updates_score() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    // Create ContributionRecord
    ts::next_tx(&mut ts, user_a());
    {
        let record = contribution::init_contribution_record(syndicate_id, ts.ctx());
        contribution::share(record);
    };

    // Record a contribution: 100 units × 5000 MIST = 500_000
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let mut record = ts::take_shared<ContributionRecord>(&ts);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::record_contribution(
            &mut syndicate,
            &mut record,
            &cap,
            user_a(),
            string::utf8(b"building_foam"),
            100,
            5000,
            string::utf8(b"test delivery"),
            &clk,
            ts.ctx(),
        );
        assert!(syndicate::member_contribution_score(&syndicate, user_a()) == 500_000, 0);
        assert!(syndicate::total_contribution_score(&syndicate) == 500_000, 1);
        clk.destroy_for_testing();
        ts::return_shared(record);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
fun test_contribution_score_accumulates() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let record = contribution::init_contribution_record(syndicate_id, ts.ctx());
        contribution::share(record);
    };

    // Two contributions from user_a
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let mut record = ts::take_shared<ContributionRecord>(&ts);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let clk = clock::create_for_testing(ts.ctx());
        // 100 × 5000 = 500_000
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_a(), string::utf8(b"building_foam"),
            100, 5000, string::utf8(b"first"), &clk, ts.ctx(),
        );
        // 50 × 2000 = 100_000
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_a(), string::utf8(b"salt"),
            50, 2000, string::utf8(b"second"), &clk, ts.ctx(),
        );
        // total: 600_000
        assert!(syndicate::member_contribution_score(&syndicate, user_a()) == 600_000, 0);
        assert!(syndicate::total_contribution_score(&syndicate) == 600_000, 1);
        assert!(contribution::entry_count(&record) == 2, 2);
        clk.destroy_for_testing();
        ts::return_shared(record);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
fun test_distribute_treasury_proportional() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 206);

    ts::next_tx(&mut ts, user_a());
    {
        let record = contribution::init_contribution_record(syndicate_id, ts.ctx());
        contribution::share(record);
    };

    // user_b joins
    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    // Record contributions: user_a = 1_000_000, user_b = 1_000_000 (50/50)
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let mut record = ts::take_shared<ContributionRecord>(&ts);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_a(), string::utf8(b"foam"), 100, 10_000,
            string::utf8(b""), &clk, ts.ctx(),
        );
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_b(), string::utf8(b"foam"), 100, 10_000,
            string::utf8(b""), &clk, ts.ctx(),
        );
        clk.destroy_for_testing();
        ts::return_shared(record);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    // Deposit 1000 into treasury
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let payment = coin::mint_for_testing<SUI>(1000, ts.ctx());
        syndicate::deposit(&mut syndicate, payment);
        ts::return_shared(syndicate);
    };

    // Distribute 1000 equally: user_a gets 500, user_b gets 500
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        syndicate::distribute_treasury(
            &mut syndicate, &cap,
            vector[user_a(), user_b()],
            1000,
            ts.ctx(),
        );
        // Dust should be ≤ 1 (50/50 split of 1000 = exact 500 each → 0 dust)
        assert!(syndicate::treasury_balance(&syndicate) == 0, 0);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    // Verify each user received 500
    ts::next_tx(&mut ts, user_a());
    {
        let coin_a = ts::take_from_address<coin::Coin<SUI>>(&ts, user_a());
        assert!(coin::value(&coin_a) == 500, 0);
        ts::return_to_address(user_a(), coin_a);
    };
    ts::next_tx(&mut ts, user_b());
    {
        let coin_b = ts::take_from_address<coin::Coin<SUI>>(&ts, user_b());
        assert!(coin::value(&coin_b) == 500, 0);
        ts::return_to_address(user_b(), coin_b);
    };

    ts::end(ts);
}

#[test]
fun test_distribute_treasury_dust_stays() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 207);

    ts::next_tx(&mut ts, user_a());
    {
        let record = contribution::init_contribution_record(syndicate_id, ts.ctx());
        contribution::share(record);
    };

    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    // 2:1 split — user_a gets 2/3, user_b gets 1/3
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let mut record = ts::take_shared<ContributionRecord>(&ts);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_a(), string::utf8(b"foam"), 2, 1,
            string::utf8(b""), &clk, ts.ctx(),
        ); // score = 2
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_b(), string::utf8(b"foam"), 1, 1,
            string::utf8(b""), &clk, ts.ctx(),
        ); // score = 1
        clk.destroy_for_testing();
        ts::return_shared(record);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let payment = coin::mint_for_testing<SUI>(10, ts.ctx());
        syndicate::deposit(&mut syndicate, payment);
        ts::return_shared(syndicate);
    };

    // Distribute 10 in 2:1 → user_a = 6, user_b = 3, dust = 1 stays
    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        syndicate::distribute_treasury(
            &mut syndicate, &cap,
            vector[user_a(), user_b()],
            10,
            ts.ctx(),
        );
        assert!(syndicate::treasury_balance(&syndicate) == 1, 0); // dust stays
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

#[test]
fun test_member_share_bps() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);

    ts::next_tx(&mut ts, user_a());
    {
        let record = contribution::init_contribution_record(syndicate_id, ts.ctx());
        contribution::share(record);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let mut record = ts::take_shared<ContributionRecord>(&ts);
        let cap = ts::take_from_sender<SyndicateOwnerCap>(&ts);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::record_contribution(
            &mut syndicate, &mut record, &cap,
            user_a(), string::utf8(b"foam"), 1, 1,
            string::utf8(b""), &clk, ts.ctx(),
        );
        // 100% = 10000 bps
        assert!(syndicate::member_share_bps(&syndicate, user_a()) == 10000, 0);
        clk.destroy_for_testing();
        ts::return_shared(record);
        ts::return_shared(syndicate);
        ts::return_to_sender(&ts, cap);
    };

    ts::end(ts);
}

// === EntryRequirements tests ===

#[test]
fun test_no_requirements_allows_all() {
    let mut ts = ts::begin(governor());
    setup_world(&mut ts);
    let syndicate_id = create_syndicate(&mut ts, user_a(), false);
    let char_b_id = create_character(&mut ts, user_b(), 208);

    // No requirements set (default: all None) — anyone can join
    ts::next_tx(&mut ts, user_b());
    {
        let mut syndicate = ts::take_shared_by_id<Syndicate>(&ts, syndicate_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let clk = clock::create_for_testing(ts.ctx());
        syndicate::join_syndicate(&mut syndicate, &character, &clk, ts.ctx());
        assert!(syndicate::is_member(&syndicate, user_b()), 0);
        clk.destroy_for_testing();
        ts::return_shared(character);
        ts::return_shared(syndicate);
    };

    ts::end(ts);
}
