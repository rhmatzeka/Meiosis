// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GeneLib} from "../src/GeneLib.sol";
import {Vectors} from "./Vectors.sol";

contract GeneLibTest is Test {
    uint256 constant LOCI = 16;

    // ---------------------------------------------------------------
    // Pagar utama: implementasi Solidity dan TypeScript harus identik.
    // Kalau test ini merah, runtime akan merakit agent yang berbeda dari
    // yang dicatat on-chain, dan seluruh klaim verifiability runtuh.
    // ---------------------------------------------------------------
    function test_MatchesTypeScriptVectors() public pure {
        uint256[5][8] memory v = Vectors.all();
        for (uint256 i = 0; i < 8; ++i) {
            assertEq(GeneLib.meiosis(v[i][0], v[i][1], v[i][2]), v[i][3], "meiosis menyimpang dari TS");
            assertEq(uint256(GeneLib.relatedness(v[i][0], v[i][1])), v[i][4], "relatedness menyimpang dari TS");
        }
    }

    // ---------------------------------------------------------------
    // Kekerabatan
    // ---------------------------------------------------------------
    function testFuzz_RelatednessSymmetric(uint256 a, uint256 b) public pure {
        assertEq(GeneLib.relatedness(a, b), GeneLib.relatedness(b, a));
    }

    function testFuzz_RelatednessSelfIsMax(uint256 a) public pure {
        assertEq(GeneLib.relatedness(a, a), 255);
    }

    // ---------------------------------------------------------------
    // Ekspresi: dominance tertinggi selalu menang
    // ---------------------------------------------------------------
    function testFuzz_ExpressPicksHighestDominance(uint256 genome, uint256 seed) public pure {
        uint8[16] memory e = GeneLib.express(genome, seed);
        for (uint256 i = 0; i < LOCI; ++i) {
            uint16 l = GeneLib.getLocus(genome, i);
            uint8 x = GeneLib.alleleX(l);
            uint8 y = GeneLib.alleleY(l);
            uint8 dx = GeneLib.dom(x);
            uint8 dy = GeneLib.dom(y);

            if (dx > dy) assertEq(e[i], GeneLib.trait(x), "alel dominan kalah");
            else if (dy > dx) assertEq(e[i], GeneLib.trait(y), "alel dominan kalah");
            else assertTrue(e[i] == GeneLib.trait(x) || e[i] == GeneLib.trait(y), "seri harus dari salah satu alel");
        }
    }

    function testFuzz_ExpressIsDeterministic(uint256 genome, uint256 seed) public pure {
        assertEq(
            keccak256(abi.encode(GeneLib.express(genome, seed))),
            keccak256(abi.encode(GeneLib.express(genome, seed)))
        );
    }

    // ---------------------------------------------------------------
    // Crossover: tiap alel anak berasal dari parent yang tepat, kecuali mutasi.
    // Mutasi hanya boleh mengubah traitId, tidak pernah dominance.
    // ---------------------------------------------------------------
    function testFuzz_ChildAllelesComeFromCorrectParent(uint256 a, uint256 b, uint256 seed) public pure {
        uint256 child = GeneLib.meiosis(a, b, seed);

        for (uint256 i = 0; i < LOCI; ++i) {
            uint16 lc = GeneLib.getLocus(child, i);
            uint16 la = GeneLib.getLocus(a, i);
            uint16 lb = GeneLib.getLocus(b, i);

            _assertFromParent(GeneLib.alleleX(lc), la, "alel kiri bukan dari parent A");
            _assertFromParent(GeneLib.alleleY(lc), lb, "alel kanan bukan dari parent B");
        }
    }

    function _assertFromParent(uint8 got, uint16 parentLocus, string memory err) internal pure {
        uint8 px = GeneLib.alleleX(parentLocus);
        uint8 py = GeneLib.alleleY(parentLocus);
        if (got == px || got == py) return;
        // kalau bukan warisan langsung, ia wajib mutasi: dominance harus terjaga
        bool mutatedFromX = GeneLib.dom(got) == GeneLib.dom(px);
        bool mutatedFromY = GeneLib.dom(got) == GeneLib.dom(py);
        assertTrue(mutatedFromX || mutatedFromY, err);
    }

    // ---------------------------------------------------------------
    // Dari parent yang sah, anak tidak pernah mewarisi trait tak bermakna.
    // Inilah yang dulu bocor: mutasi membalik bit pada traitId 6-bit dan
    // menghasilkan nilai di luar katalog lokusnya.
    // ---------------------------------------------------------------
    function testFuzz_ChildTraitsAlwaysValid(uint256 seed, uint8 pa, uint8 pb) public pure {
        uint256[4] memory f = Vectors.founders();
        uint256 a = f[pa % 4];
        uint256 b = f[pb % 4];

        uint8[16] memory e = GeneLib.express(GeneLib.meiosis(a, b, seed), seed);
        for (uint256 i = 0; i < LOCI; ++i) {
            assertLt(e[i], GeneLib.traitCount(i), "trait di luar katalog lokus");
        }
    }

    function test_FoundersThemselvesAreValid() public pure {
        uint256[4] memory f = Vectors.founders();
        for (uint256 k = 0; k < 4; ++k) {
            uint8[16] memory e = GeneLib.express(f[k], 0);
            for (uint256 i = 0; i < LOCI; ++i) {
                assertLt(e[i], GeneLib.traitCount(i), "genome founder memuat trait tak sah");
            }
        }
    }

    // ---------------------------------------------------------------
    // Rancangan founder: G0 mewariskan security tinggi, G1 mewariskan
    // estetika tinggi kira-kira separuh waktu. Lihat PLAN.md §4.2.
    // ---------------------------------------------------------------
    function test_HybridVigorRateAboveThreshold() public pure {
        uint256[4] memory f = Vectors.founders();
        uint256 both;
        uint256 n = 400;

        for (uint256 i = 0; i < n; ++i) {
            uint256 seed = uint256(keccak256(abi.encode(i)));
            uint8[16] memory e = GeneLib.express(GeneLib.meiosis(f[0], f[1], seed), seed);
            if (e[6] == 2 && e[4] == 2) ++both; // L6 security high & L4 aesthetic high
        }
        assertGe(both * 100 / n, 40, "pewarisan kedua trait unggulan di bawah ambang 40%");
    }
}
