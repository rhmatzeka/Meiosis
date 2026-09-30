// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Genesis} from "../src/Genesis.sol";
import {Hatchery} from "../src/Hatchery.sol";
import {LineageRoyalty} from "../src/LineageRoyalty.sol";
import {Market} from "../src/Market.sol";
import {Vectors} from "./Vectors.sol";

contract MarketTest is Test {
    AgentRegistry reg;
    Hatchery hat;
    LineageRoyalty roy;
    Market market;

    address alice = makeAddr("alice"); // pemilik founder g0 dan anak
    address bob   = makeAddr("bob");   // pemilik founder g1
    address dave  = makeAddr("dave");  // pembeli / penyewa
    address erin  = makeAddr("erin");

    uint64 g0; uint64 g1; uint64 child;

    function setUp() public {
        reg = new AgentRegistry();
        Genesis gen = new Genesis(reg);
        roy = new LineageRoyalty(reg);
        hat = new Hatchery(reg, roy);
        market = new Market(reg, roy, 250);
        reg.setMinter(address(gen), true);
        reg.setMinter(address(hat), true);

        uint256[4] memory f = Vectors.founders();
        g0 = gen.mintFounder(alice, f[0], "Solidity Smith");
        g1 = gen.mintFounder(bob, f[1], "Pixel Sense");
        gen.seal();

        vm.prank(bob);
        hat.listForStud(g1, 0);
        vm.roll(block.number + 1);
        vm.prank(alice);
        uint64 pid = hat.breed(g0, g1);
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);
        child = hat.hatch(pid); // milik alice, induk g0 (alice) & g1 (bob)

        vm.deal(dave, 100 ether);
        vm.deal(erin, 100 ether);
    }

    function _list(uint64 id, uint256 price) internal {
        vm.startPrank(reg.ownerOf(id));
        reg.setApprovalForAll(address(market), true);
        market.list(id, price);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- jual

    function test_ListRequiresApproval() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Market.NotApproved.selector, child));
        market.list(child, 1 ether);
    }

    function test_ListRequiresOwner() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.NotOwner.selector, child));
        market.list(child, 1 ether);
    }

    function test_ListRejectsZeroPrice() public {
        vm.startPrank(alice);
        reg.setApprovalForAll(address(market), true);
        vm.expectRevert(Market.ZeroPrice.selector);
        market.list(child, 0);
        vm.stopPrank();
    }

    function test_BuySplitsFeeRoyaltyAndTransfers() public {
        _list(child, 1 ether);
        vm.prank(dave);
        market.buy{value: 1 ether}(child);

        assertEq(reg.ownerOf(child), dave);
        assertEq(market.fees(), 0.025 ether);                     // 2,5% platform
        uint256 net = 0.975 ether;
        uint256 perParent = (net * 500) / 10_000 / 2;            // 5% dibagi dua induk
        assertEq(roy.pending(bob), perParent);                    // induk kedua
        assertEq(roy.pending(alice), net - perParent);            // penjual + induk pertama
        (, , bool valid) = market.listingOf(child);
        assertFalse(valid);
    }

    function test_BuyRefundsExcess() public {
        _list(child, 1 ether);
        uint256 before = dave.balance;
        vm.prank(dave);
        market.buy{value: 3 ether}(child);
        assertEq(dave.balance, before - 1 ether);
    }

    function test_BuyRejectsUnderpayment() public {
        _list(child, 1 ether);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.InsufficientPayment.selector, 1 ether, 0.5 ether));
        market.buy{value: 0.5 ether}(child);
    }

    function test_BuyRejectsStaleListing() public {
        _list(child, 1 ether);
        vm.prank(alice);
        reg.transferFrom(alice, erin, child); // pindah tangan di luar pasar
        (, , bool valid) = market.listingOf(child);
        assertFalse(valid);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.StaleListing.selector, child));
        market.buy{value: 1 ether}(child);
    }

    function test_BuyRejectsOwnListing() public {
        _list(child, 1 ether);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Market.OwnListing.selector, child));
        market.buy{value: 1 ether}(child);
    }

    function test_BuyRejectsUnlisted() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.NotListed.selector, child));
        market.buy{value: 1 ether}(child);
    }

    function test_CancelBySellerOrCurrentOwner() public {
        _list(child, 1 ether);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.NotOwner.selector, child));
        market.cancel(child);
        vm.prank(alice);
        market.cancel(child);
        (, , bool valid) = market.listingOf(child);
        assertFalse(valid);
    }

    function test_BuyClearsRentPrice() public {
        vm.prank(alice);
        market.setRentPrice(child, 0.01 ether);
        _list(child, 1 ether);
        vm.prank(dave);
        market.buy{value: 1 ether}(child);
        assertEq(market.rentPrice(child), 0);
    }

    // ---------------------------------------------------------------- sewa

    function test_OnlyOwnerSetsRentPrice() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.NotOwner.selector, child));
        market.setRentPrice(child, 1);
    }

    function test_RentSplitsLikeASale() public {
        vm.prank(alice);
        market.setRentPrice(child, 0.1 ether);
        vm.prank(dave);
        market.rent{value: 0.1 ether}(child, keccak256("job-1"));
        assertEq(market.fees(), 0.0025 ether);
        uint256 net = 0.0975 ether;
        uint256 perParent = (net * 500) / 10_000 / 2;
        assertEq(roy.pending(bob), perParent);
        assertEq(roy.pending(alice), net - perParent);
        assertEq(reg.ownerOf(child), alice); // sewa tidak memindahkan kepemilikan
    }

    function test_RentEnforcesPrice() public {
        vm.prank(alice);
        market.setRentPrice(child, 0.1 ether);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.InsufficientPayment.selector, 0.1 ether, 0.05 ether));
        market.rent{value: 0.05 ether}(child, keccak256("job-1"));
    }

    function test_RentRejectsZeroPayment() public {
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(Market.InsufficientPayment.selector, 1, 0));
        market.rent{value: 0}(child, keccak256("job-1"));
    }

    function test_RentEmitsJob() public {
        bytes32 job = keccak256("job-7");
        vm.expectEmit(true, true, false, true);
        emit Market.Rented(child, dave, 0.01 ether, job);
        vm.prank(dave);
        market.rent{value: 0.01 ether}(child, job);
    }

    // ---------------------------------------------------------------- platform

    function test_OwnerWithdrawsFees() public {
        _list(child, 1 ether);
        vm.prank(dave);
        market.buy{value: 1 ether}(child);
        uint256 before = address(this).balance;
        market.withdrawFees();
        assertEq(address(this).balance, before + 0.025 ether);
        assertEq(market.fees(), 0);
    }

    function test_FeeCappedAtTenPercent() public {
        vm.expectRevert(Market.FeeTooHigh.selector);
        market.setFeeBps(1001);
        vm.expectRevert(Market.FeeTooHigh.selector);
        new Market(reg, roy, 1001);
    }

    receive() external payable {}
}
