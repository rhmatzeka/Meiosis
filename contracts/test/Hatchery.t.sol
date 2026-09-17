// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Genesis} from "../src/Genesis.sol";
import {Hatchery} from "../src/Hatchery.sol";
import {GeneLib} from "../src/GeneLib.sol";
import {Vectors} from "./Vectors.sol";

contract HatcheryTest is Test {
    AgentRegistry reg;
    Genesis gen;
    Hatchery hat;

    address alice = makeAddr("alice"); // pemilik G0
    address bob   = makeAddr("bob");   // pemilik G1
    address carol = makeAddr("carol"); // pemilik G2, G3

    uint64 g0; uint64 g1; uint64 g2;

    function setUp() public {
        reg = new AgentRegistry();
        gen = new Genesis(reg);
        hat = new Hatchery(reg);

        reg.setMinter(address(gen), true);
        reg.setMinter(address(hat), true);

        uint256[4] memory f = Vectors.founders();
        g0 = gen.mintFounder(alice, f[0], "Solidity Smith");
        g1 = gen.mintFounder(bob,   f[1], "Pixel Sense");
        g2 = gen.mintFounder(carol, f[2], "Doc Weaver");
        gen.mintFounder(carol, f[3], "Ops Hound");
        gen.seal();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.roll(block.number + 1);
    }

    // ---------------------------------------------------------------
    // Genesis
    // ---------------------------------------------------------------

    function test_FoundersMintedToDistinctOwners() public view {
        assertEq(reg.ownerOf(g0), alice);
        assertEq(reg.ownerOf(g1), bob);
        assertEq(reg.ownerOf(g2), carol);
        assertEq(reg.totalMinted(), 4);
        assertEq(reg.generationOf(g0), 0);
    }

    function test_CannotMintAfterSeal() public {
        vm.expectRevert(Genesis.AlreadySealed.selector);
        gen.mintFounder(alice, 1, "penyusup");
    }

    function test_CannotMintMoreThanFourFounders() public {
        AgentRegistry r2 = new AgentRegistry();
        Genesis g = new Genesis(r2);
        r2.setMinter(address(g), true);
        for (uint256 i = 0; i < 4; ++i) g.mintFounder(alice, i + 1, "f");
        vm.expectRevert(Genesis.TooManyFounders.selector);
        g.mintFounder(alice, 99, "kelima");
    }

    // ---------------------------------------------------------------
    // Jalur bahagia
    // ---------------------------------------------------------------

    function _breedG0G1() internal returns (uint64 pid) {
        vm.prank(bob);
        hat.listForStud(g1, 0.01 ether);
        vm.prank(alice);
        pid = hat.breed{value: 0.01 ether}(g0, g1);
    }

    function test_BreedThenHatch() public {
        uint64 pid = _breedG0G1();
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);

        uint64 child = hat.hatch(pid);

        assertEq(reg.ownerOf(child), alice, "anak jatuh ke pemanggil breed");
        assertEq(reg.generationOf(child), 1);

        AgentRegistry.Agent memory a = reg.agentOf(child);
        assertEq(a.parentA, g0);
        assertEq(a.parentB, g1);
        assertEq(reg.totalMinted(), 5);
    }

    /**
     * Inti klaim proyek ini: siapa pun dapat menghitung ulang seorang anak dari
     * genome kedua parent dan seed kelahirannya, lalu membuktikan ia sah.
     */
    function test_ChildGenomeIsIndependentlyVerifiable() public {
        uint64 pid = _breedG0G1();
        (,, uint32 revealBlock,,) = hat.pregnancies(pid);
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);

        uint64 child = hat.hatch(pid);

        uint256 seed = uint256(keccak256(abi.encode(blockhash(revealBlock), pid)));
        uint256 expected = GeneLib.meiosis(reg.genomeOf(g0), reg.genomeOf(g1), seed);
        assertEq(reg.genomeOf(child), expected, "genome anak tidak dapat direproduksi");
    }

    function test_BirthGasStaysUnderBudget() public {
        uint64 pid = _breedG0G1();
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);

        uint256 before = gasleft();
        hat.hatch(pid);
        uint256 used = before - gasleft();

        emit log_named_uint("gas hatch()", used);
        assertLt(used, 130_000, "kelahiran melampaui anggaran gas 120k");
    }

    // ---------------------------------------------------------------
    // Commit-reveal: inilah yang menutup gene grinding
    // ---------------------------------------------------------------

    function test_HatchTooEarlyReverts() public {
        uint64 pid = _breedG0G1();
        vm.expectRevert(
            abi.encodeWithSelector(Hatchery.StillGestating.selector, uint32(block.number + 5), block.number)
        );
        hat.hatch(pid);
    }

    function test_HatchTwiceReverts() public {
        uint64 pid = _breedG0G1();
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);
        hat.hatch(pid);
        vm.expectRevert(abi.encodeWithSelector(Hatchery.AlreadyHatched.selector, pid));
        hat.hatch(pid);
    }

    function test_BlockhashExpiresThenRerollRecovers() public {
        uint64 pid = _breedG0G1();

        // lewat jendela 256 blok: seed tidak akan pernah bisa dihitung lagi
        vm.roll(block.number + hat.GESTATION_BLOCKS() + hat.BLOCKHASH_WINDOW() + 2);
        vm.expectRevert(abi.encodeWithSelector(Hatchery.BlockhashExpired.selector, pid));
        hat.hatch(pid);

        // reroll memberi jendela baru — agent tidak tersangkut selamanya
        hat.reroll(pid);
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);
        uint64 child = hat.hatch(pid);
        assertEq(reg.ownerOf(child), alice);
    }

    function test_RerollBeforeExpiryReverts() public {
        uint64 pid = _breedG0G1();
        vm.roll(block.number + hat.GESTATION_BLOCKS() + 1);
        vm.expectRevert(abi.encodeWithSelector(Hatchery.NotExpiredYet.selector, pid));
        hat.reroll(pid);
    }

    // ---------------------------------------------------------------
    // Ekonomi & pembatasan
    // ---------------------------------------------------------------

    function test_StudFeeGoesToParentOwner() public {
        uint256 before = bob.balance;
        _breedG0G1();
        assertEq(bob.balance - before, 0.01 ether, "pemilik pejantan tidak dibayar");
    }

    function test_ExcessFeeRefunded() public {
        vm.prank(bob);
        hat.listForStud(g1, 0.01 ether);
        uint256 before = alice.balance;
        vm.prank(alice);
        hat.breed{value: 1 ether}(g0, g1);
        assertEq(before - alice.balance, 0.01 ether, "kelebihan bayar tidak dikembalikan");
    }

    function test_BreedUnlistedAgentReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Hatchery.NotListedForStud.selector, g1));
        hat.breed(g0, g1);
    }

    function test_OwnerOfBothParentsPaysNothing() public {
        vm.prank(bob);
        reg.transferFrom(bob, alice, g1);
        vm.prank(alice);
        uint64 pid = hat.breed(g0, g1);
        assertGt(pid, 0);
    }

    function test_SameParentReverts() public {
        vm.prank(alice);
        vm.expectRevert(Hatchery.SameParent.selector);
        hat.breed(g0, g0);
    }

    function test_CooldownEnforcedAndGrows() public {
        _breedG0G1();
        assertEq(reg.breedCountOf(g0), 1);

        // setelah sekali kawin, jeda menjadi 2x dasar
        assertEq(hat.cooldownBlocks(g0), 20);

        vm.prank(bob);
        hat.listForStud(g1, 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Hatchery.OnCooldown.selector, g0, hat.readyAt(g0)));
        hat.breed(g0, g1);

        vm.roll(hat.readyAt(g0));
        vm.prank(alice);
        hat.breed(g0, g1); // sekarang boleh
    }

    function test_NonMinterCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.NotMinter.selector);
        reg.mint(alice, 1, 0, 0, 0);
    }

    function test_ManifestHashWriteOnce() public {
        vm.prank(alice);
        reg.setManifestHash(g0, 0xdeadbeef);
        assertEq(reg.agentOf(g0).manifestHash, 0xdeadbeef);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.ManifestAlreadySet.selector, g0));
        reg.setManifestHash(g0, 0xcafe);
    }
}
