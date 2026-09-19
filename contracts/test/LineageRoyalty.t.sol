// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Genesis} from "../src/Genesis.sol";
import {Hatchery} from "../src/Hatchery.sol";
import {LineageRoyalty} from "../src/LineageRoyalty.sol";
import {Vectors} from "./Vectors.sol";

contract LineageRoyaltyTest is Test {
    AgentRegistry reg;
    Hatchery hat;
    LineageRoyalty roy;

    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave  = makeAddr("dave"); // penyewa, tidak memiliki agent apa pun

    uint64 g0; uint64 g1; uint64 g2; uint64 g3;

    function setUp() public {
        reg = new AgentRegistry();
        Genesis gen = new Genesis(reg);
        roy = new LineageRoyalty(reg);
        hat = new Hatchery(reg, roy);
        reg.setMinter(address(gen), true);
        reg.setMinter(address(hat), true);

        uint256[4] memory f = Vectors.founders();
        g0 = gen.mintFounder(alice, f[0], "Solidity Smith");
        g1 = gen.mintFounder(bob,   f[1], "Pixel Sense");
        g2 = gen.mintFounder(carol, f[2], "Doc Weaver");
        g3 = gen.mintFounder(carol, f[3], "Ops Hound");
        gen.seal();

        vm.deal(dave, 100 ether);
        vm.roll(block.number + 1);
    }

    function _birth(address who, uint64 a, uint64 b) internal returns (uint64 child) {
        vm.prank(who);
        uint64 pid = hat.breed(a, b);
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);
        child = hat.hatch(pid);
        vm.roll(block.number + 200); // lewati cooldown untuk kelahiran berikutnya
    }

    /// Cucu dari keempat founder: (g0 × g1) × (g2 × g3).
    function _grandchild() internal returns (uint64 c1, uint64 c2, uint64 gc) {
        vm.prank(bob);
        hat.listForStud(g1, 0);
        c1 = _birth(alice, g0, g1);   // milik alice
        c2 = _birth(carol, g2, g3);   // milik carol
        vm.prank(carol);
        hat.listForStud(c2, 0);
        gc = _birth(alice, c1, c2);   // milik alice
    }

    function test_FounderPaymentGoesWhollyToOwner() public {
        vm.prank(dave);
        roy.pay{value: 1 ether}(g1, "sewa");
        assertEq(roy.pending(bob), 1 ether);
    }

    function test_ShareSplitAcrossTwoGenerations() public {
        (,, uint64 gc) = _grandchild();

        vm.prank(dave);
        roy.pay{value: 1 ether}(gc, "sewa");

        // induk: 5% dibagi dua. c1 milik alice, c2 milik carol.
        // kakek-nenek: 2,5% dibagi empat. g0 alice, g1 bob, g2 & g3 carol.
        // sisanya untuk alice sebagai pemilik gc.
        uint256 parent = 0.025 ether;
        uint256 grand = 0.00625 ether;
        assertEq(roy.pending(bob), grand, "bob: satu kakek");
        assertEq(roy.pending(carol), parent + 2 * grand, "carol: satu induk, dua kakek");
        assertEq(roy.pending(alice), 1 ether - (parent + 2 * grand) - grand, "alice: induk c1, kakek g0, dan sisanya");
    }

    function testFuzz_NothingCreatedOrLost(uint96 amount) public {
        (,, uint64 gc) = _grandchild();
        vm.deal(dave, uint256(amount));
        vm.prank(dave);
        roy.pay{value: amount}(gc, "sewa");
        assertEq(roy.pending(alice) + roy.pending(bob) + roy.pending(carol), amount);
        assertEq(address(roy).balance, amount);
    }

    function test_RoyaltyFollowsCurrentOwner() public {
        (uint64 c1,, uint64 gc) = _grandchild();
        // alice menjual c1 ke dave; royalti berikutnya dari gc untuk c1 jatuh ke dave
        vm.prank(alice);
        reg.transferFrom(alice, dave, c1);
        vm.prank(dave);
        roy.pay{value: 1 ether}(gc, "sewa");
        assertEq(roy.pending(dave), 0.025 ether);
    }

    function test_StudFeeFlowsToStudsAncestors() public {
        (, uint64 c2,) = _grandchild();
        // bob mengawinkan founder-nya dengan c2 milik carol, bayar 1 ether
        vm.prank(carol);
        hat.listForStud(c2, 1 ether);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        hat.breed{value: 1 ether}(g1, c2);

        // induk c2 adalah g2 & g3, keduanya milik carol: 5% tetap ke carol
        assertEq(roy.pending(carol), 1 ether);
        assertEq(roy.pending(bob), 0);
    }

    function test_PayUnknownAgentReverts() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(LineageRoyalty.NoSuchAgent.selector, uint64(99)));
        roy.pay{value: 1}(99, "sewa");
    }

    function test_WithdrawNothingReverts() public {
        vm.prank(dave);
        vm.expectRevert(LineageRoyalty.NothingToWithdraw.selector);
        roy.withdraw();
    }

    function test_WithdrawPaysOutOnce() public {
        vm.prank(dave);
        roy.pay{value: 1 ether}(g1, "sewa");
        uint256 before = bob.balance;
        vm.prank(bob);
        roy.withdraw();
        assertEq(bob.balance - before, 1 ether);
        vm.prank(bob);
        vm.expectRevert(LineageRoyalty.NothingToWithdraw.selector);
        roy.withdraw();
    }

    // ---------------------------------------------------------------
    // Nama agent
    // ---------------------------------------------------------------

    function test_OwnerCanName() public {
        vm.prank(alice);
        reg.setName(g0, "Penjaga Gerbang");
        assertEq(reg.nameOf(g0), "Penjaga Gerbang");
    }

    function test_StrangerCannotName() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotAgentOwner.selector, g0));
        reg.setName(g0, "curian");
    }

    function test_NameLengthBounded() public {
        vm.startPrank(alice);
        vm.expectRevert(AgentRegistry.BadName.selector);
        reg.setName(g0, "");
        vm.expectRevert(AgentRegistry.BadName.selector);
        reg.setName(g0, "nama yang terlalu panjang untuk sebuah kartu agent");
        vm.stopPrank();
    }
}
