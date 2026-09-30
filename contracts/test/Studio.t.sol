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

    function setUp() public {
        reg = new AgentRegistry();
        studio = new Studio(reg, FEE);
        reg.setMinter(address(studio), true);
        vm.deal(alice, 1 ether);
    }

    function _d(uint8 tier, uint8 disc, uint8 stack, uint8 verb, uint8 ta, uint8 tb)
        internal pure returns (Studio.Design memory)
    {
        return Studio.Design(tier, disc, stack, verb, ta, tb);
    }

    // Sama persis dengan STUDIO_VECTORS di packages/shared/src/studio.ts.
    function test_PreviewMatchesTypeScriptVectors() public view {
        assertEq(studio.preview(_d(1, 1, 1, 0, 6, 4)), 0x4040414141414141404040404343414141414242414142424141404041414141);
        assertEq(studio.preview(_d(0, 2, 0, 1, 255, 255)), 0x4040414141414141414140404343414141414141414141414040404042424040);
        assertEq(studio.preview(_d(1, 5, 3, 2, 14, 5)), 0x4040424241414141424240404343414141414141424241414343404045454141);
    }

    function test_CreateMintsToCreatorWithNameAndManifest() public {
        vm.prank(alice);
        uint64 id = studio.create{value: FEE}(_d(1, 1, 1, 0, 6, 4), "Penjaga Form", 0x1234);
        assertEq(reg.ownerOf(id), alice);
        assertEq(reg.nameOf(id), "Penjaga Form");
        assertEq(reg.agentOf(id).manifestHash, 0x1234);
        assertEq(reg.agentOf(id).genome, studio.preview(_d(1, 1, 1, 0, 6, 4)));
        assertEq(reg.generationOf(id), 0);
        assertTrue(studio.designed(id));
    }

    function test_CreateWithoutNameKeepsDefault() public {
        vm.prank(alice);
        uint64 id = studio.create{value: FEE}(_d(0, 2, 0, 1, 255, 255), "", 0);
        assertEq(reg.ownerOf(id), alice);
        assertEq(bytes(reg.nameOf(id)).length, 0);
        assertEq(reg.agentOf(id).manifestHash, 0);
    }

    function test_ExcessIsRefundedAndFeeKept() public {
        uint256 before = alice.balance;
        vm.prank(alice);
        studio.create{value: 0.01 ether}(_d(1, 1, 1, 0, 6, 4), "", 0);
        assertEq(alice.balance, before - FEE);
        assertEq(address(studio).balance, FEE);
    }

    function test_RejectsInsufficientFee() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Studio.InsufficientFee.selector, FEE, FEE - 1));
        studio.create{value: FEE - 1}(_d(1, 1, 1, 0, 6, 4), "", 0);
    }

    function test_RejectsStrongBrain() public {
        vm.expectRevert(Studio.BadDesign.selector);
        studio.preview(_d(2, 1, 1, 0, 6, 4));
    }

    function test_RejectsTwinTalents() public {
        vm.expectRevert(Studio.BadDesign.selector);
        studio.preview(_d(1, 1, 1, 0, 6, 6));
    }

    function test_RejectsTalentOutsideList() public {
        vm.expectRevert(Studio.BadDesign.selector);
        studio.preview(_d(1, 1, 1, 0, 0, 255));
    }

    function test_RejectsOutOfRangeChoices() public {
        vm.expectRevert(Studio.BadDesign.selector);
        studio.preview(_d(1, 6, 1, 0, 255, 255));
        vm.expectRevert(Studio.BadDesign.selector);
        studio.preview(_d(1, 1, 4, 0, 255, 255));
        vm.expectRevert(Studio.BadDesign.selector);
        studio.preview(_d(1, 1, 1, 3, 255, 255));
    }

    function test_OwnerSetsFeeAndWithdraws() public {
        vm.prank(alice);
        studio.create{value: FEE}(_d(1, 1, 1, 0, 6, 4), "", 0);
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
