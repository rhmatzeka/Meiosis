// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Genesis} from "../src/Genesis.sol";
import {LineageRoyalty} from "../src/LineageRoyalty.sol";
import {Market} from "../src/Market.sol";
import {Credits} from "../src/Credits.sol";
import {Vectors} from "./Vectors.sol";

contract CreditsTest is Test {
    AgentRegistry reg;
    LineageRoyalty roy;
    Market market;
    Credits credits;

    address alice = makeAddr("alice");     // pemilik agent
    address user = makeAddr("user");       // pemakai lewat Claude Code
    address operator = makeAddr("operator");
    uint64 agent;

    function setUp() public {
        reg = new AgentRegistry();
        Genesis gen = new Genesis(reg);
        roy = new LineageRoyalty(reg);
        market = new Market(reg, roy, 250);
        credits = new Credits(market, operator, 0.001 ether);
        reg.setMinter(address(gen), true);
        agent = gen.mintFounder(alice, Vectors.founders()[0], "Solidity Smith");
        vm.deal(user, 10 ether);
    }

    function _deposit(uint256 v) internal {
        vm.prank(user);
        credits.deposit{value: v}();
    }

    function test_DepositAndWithdraw() public {
        _deposit(1 ether);
        assertEq(credits.balanceOf(user), 1 ether);
        uint256 before = user.balance;
        vm.prank(user);
        credits.withdraw(0.4 ether);
        assertEq(credits.balanceOf(user), 0.6 ether);
        assertEq(user.balance, before + 0.4 ether);
    }

    function test_WithdrawMoreThanBalanceReverts() public {
        _deposit(0.1 ether);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Credits.InsufficientBalance.selector, 0.2 ether, 0.1 ether));
        credits.withdraw(0.2 ether);
    }

    function test_OnlyOperatorSpends() public {
        _deposit(1 ether);
        vm.prank(user);
        vm.expectRevert(Credits.NotOperator.selector);
        credits.spend(user, agent, 0.001 ether, keccak256("job"));
    }

    function test_SpendPaysAgentOwnerThroughMarket() public {
        _deposit(1 ether);
        vm.prank(operator);
        credits.spend(user, agent, 0.001 ether, keccak256("job-1"));
        assertEq(credits.balanceOf(user), 1 ether - 0.001 ether);
        assertEq(market.fees(), 0.000025 ether);                 // 2,5% platform
        assertEq(roy.pending(alice), 0.000975 ether);              // founder: tanpa leluhur
    }

    function test_SpendCappedAtDefaultPriceWhenOwnerSetNone() public {
        _deposit(1 ether);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Credits.OverPrice.selector, 0.002 ether, 0.001 ether));
        credits.spend(user, agent, 0.002 ether, keccak256("job-1"));
    }

    function test_SpendCappedAtOwnerRentPrice() public {
        vm.prank(alice);
        market.setRentPrice(agent, 0.005 ether);
        _deposit(1 ether);
        vm.prank(operator);
        credits.spend(user, agent, 0.005 ether, keccak256("job-1")); // harga pemilik berlaku
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Credits.OverPrice.selector, 0.006 ether, 0.005 ether));
        credits.spend(user, agent, 0.006 ether, keccak256("job-2"));
    }

    function test_JobCannotBeChargedTwice() public {
        _deposit(1 ether);
        vm.startPrank(operator);
        credits.spend(user, agent, 0.001 ether, keccak256("job-1"));
        vm.expectRevert(abi.encodeWithSelector(Credits.JobUsed.selector, keccak256("job-1")));
        credits.spend(user, agent, 0.001 ether, keccak256("job-1"));
        vm.stopPrank();
    }

    function test_SpendRequiresBalance() public {
        _deposit(0.0005 ether);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Credits.InsufficientBalance.selector, 0.001 ether, 0.0005 ether));
        credits.spend(user, agent, 0.001 ether, keccak256("job-1"));
    }

    function test_SpendRejectsZero() public {
        _deposit(1 ether);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Credits.OverPrice.selector, 0, 0.001 ether));
        credits.spend(user, agent, 0, keccak256("job-1"));
    }

    function test_SpendEmitsForAudit() public {
        _deposit(1 ether);
        vm.expectEmit(true, true, true, true);
        emit Credits.Spent(user, agent, keccak256("job-9"), 0.001 ether);
        vm.prank(operator);
        credits.spend(user, agent, 0.001 ether, keccak256("job-9"));
    }

    function test_OwnerManagesOperatorAndDefaultPrice() public {
        credits.setOperator(alice);
        credits.setDefaultPrice(0.002 ether);
        assertEq(credits.operator(), alice);
        assertEq(credits.defaultPrice(), 0.002 ether);
        vm.prank(user);
        vm.expectRevert();
        credits.setOperator(user);
    }
}
