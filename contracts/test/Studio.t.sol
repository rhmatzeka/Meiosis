// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Studio} from "../src/Studio.sol";

contract StudioTest is Test {
    AgentRegistry reg;
    Studio studio;
    address alice = makeAddr("alice");
    uint256 constant FEE = 0.002 ether;
    bytes32 constant SOUL = keccak256("Kamu agent yang ramah dan teliti.");

    function setUp() public {
        reg = new AgentRegistry();
        studio = new Studio(reg, FEE);
        reg.setMinter(address(studio), true);
        vm.deal(alice, 1 ether);
    }

    function _t(uint8[16] memory v) internal pure returns (uint8[16] memory) { return v; }

    function _default() internal pure returns (uint8[16] memory) {
        return [1, 1, 0, 0, 1, 1, 1, 1, 1, 3, 0, 1, 1, 1, 1, 0];
    }

    // Sama persis dengan STUDIO_VECTORS di packages/shared/src/studio.ts.
    function test_PreviewMatchesTypeScriptVectors() public view {
        assertEq(studio.preview(_default()), 0x8080818181818181818180808383818181818181818181818080808081818181);
        assertEq(studio.preview(_t([2, 5, 5, 3, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 0])),
            0x8080828282828282828283838383828282828282828282828383858585858282);
        assertEq(studio.preview(_t([2, 2, 4, 1, 2, 0, 2, 1, 2, 1, 3, 0, 2, 2, 0, 0])),
            0x8080808082828282808083838181828281818282808082828181848482828282);
    }

    function test_StrongBrainAndAllTalentsAreAllowed() public {
        vm.prank(alice);
        uint64 id = studio.create{value: FEE}(_t([2, 1, 4, 1, 2, 2, 2, 2, 2, 3, 3, 0, 2, 2, 2, 0]), "Serba Unggul", 0, bytes32(0));
        assertEq(reg.ownerOf(id), alice);
    }

    function test_CreateStoresNameManifestAndSoulHash() public {
        vm.prank(alice);
        uint64 id = studio.create{value: FEE}(_default(), "Penjaga Form", 0x1234, SOUL);
        assertEq(reg.ownerOf(id), alice);
        assertEq(reg.nameOf(id), "Penjaga Form");
        assertEq(reg.agentOf(id).manifestHash, 0x1234);
        assertEq(reg.agentOf(id).genome, studio.preview(_default()));
        assertEq(reg.generationOf(id), 0);
        assertTrue(studio.designed(id));
        assertEq(studio.soulOf(id), SOUL);
    }

    function test_CreateWithoutNameOrSoul() public {
        vm.prank(alice);
        uint64 id = studio.create{value: FEE}(_default(), "", 0, bytes32(0));
        assertEq(bytes(reg.nameOf(id)).length, 0);
        assertEq(studio.soulOf(id), bytes32(0));
    }

    function test_RejectsTraitOutOfRangeForItsLocus() public {
        uint8[16] memory t = _default();
        t[3] = 4; // stack hanya 0..3
        vm.expectRevert(abi.encodeWithSelector(Studio.BadTrait.selector, 3, 4));
        studio.preview(t);
        t = _default();
        t[15] = 1; // lokus cadangan hanya 0
        vm.expectRevert(abi.encodeWithSelector(Studio.BadTrait.selector, 15, 1));
        studio.preview(t);
    }

    function test_ExcessIsRefundedAndFeeKept() public {
        uint256 before = alice.balance;
        vm.prank(alice);
        studio.create{value: 0.01 ether}(_default(), "", 0, bytes32(0));
        assertEq(alice.balance, before - FEE);
        assertEq(address(studio).balance, FEE);
    }

    function test_RejectsInsufficientFee() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Studio.InsufficientFee.selector, FEE, FEE - 1));
        studio.create{value: FEE - 1}(_default(), "", 0, bytes32(0));
    }

    function test_OwnerSetsFeeAndWithdraws() public {
        vm.prank(alice);
        studio.create{value: FEE}(_default(), "", 0, bytes32(0));
        studio.setFee(0.005 ether);
        assertEq(studio.fee(), 0.005 ether);
        uint256 before = address(this).balance;
        studio.withdrawFees();
        assertEq(address(this).balance, before + FEE);
    }

    function test_OnlyOwnerManagesFees() public {
        vm.prank(alice);
        vm.expectRevert();
        studio.setFee(0);
        vm.prank(alice);
        vm.expectRevert();
        studio.withdrawFees();
    }

    receive() external payable {}
}
