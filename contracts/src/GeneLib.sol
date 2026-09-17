// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GeneLib
 * @notice Model genetik Meiosis. Seluruh fungsi di sini `pure`, sehingga
 *         siapa pun dapat menghitung ulang seorang anak dari genome kedua parent
 *         dan seed kelahirannya, lalu membuktikan bahwa ia sah.
 *
 * Tata letak:
 *   genome : uint256 = 16 lokus x 16 bit, lokus i di bit [16i, 16i+16)
 *   lokus  : [ alelX 8 bit (tinggi) | alelY 8 bit (rendah) ]
 *   alel   : [ dominance 2 bit (tinggi) | traitId 6 bit (rendah) ]
 *
 * Cermin TypeScript-nya ada di packages/shared/src/genome.ts dan keduanya
 * dijaga tetap identik oleh test/GeneLib.t.sol.
 */
library GeneLib {
    uint256 internal constant LOCUS_COUNT = 16;
    uint256 internal constant MUT_SALT_1 = 1;
    uint256 internal constant MUT_SALT_2 = 2;

    /// @dev 2/256 ~ 0,78% peluang mutasi per lokus; ~12% anak membawa >=1 mutasi.
    uint8 internal constant MUTATION_THRESHOLD = 2;

    /**
     * @dev Jumlah trait valid per lokus, dipak 8 bit per lokus.
     *      [3,6,6,4,3,3,3,3,3,4,4,3,3,3,3,1] dari L0 ke L15.
     *      Mutasi wajib menghasilkan trait yang sah untuk lokusnya; membalik bit
     *      sembarangan pada traitId 6-bit menghasilkan nilai tak bermakna.
     */
    uint256 internal constant TRAIT_COUNTS = 0x01030303030404030303030304060603;

    function traitCount(uint256 i) internal pure returns (uint8) {
        return uint8(TRAIT_COUNTS >> (8 * i));
    }

    function makeAllele(uint8 dominance, uint8 traitId) internal pure returns (uint8) {
        return uint8((dominance << 6) | (traitId & 63));
    }

    function getLocus(uint256 g, uint256 i) internal pure returns (uint16) {
        return uint16(g >> (16 * i));
    }

    function alleleX(uint16 l) internal pure returns (uint8) { return uint8(l >> 8); }
    function alleleY(uint16 l) internal pure returns (uint8) { return uint8(l); }
    function dom(uint8 a) internal pure returns (uint8) { return (a >> 6) & 3; }
    function trait(uint8 a) internal pure returns (uint8) { return a & 63; }

    /**
     * @notice Meiosis. Tiap lokus mengambil satu alel dari masing-masing parent,
     *         lalu berpeluang kecil mengalami mutasi.
     * @dev Namanya sengaja `meiosis`, bukan `crossover`. Yang terjadi di sini
     *      adalah independent assortment — memilih satu dari dua alel per lokus,
     *      lalu fertilisasi. Crossover dalam arti biologisnya adalah pertukaran
     *      segmen antar kromosom homolog, dan itu tidak dilakukan di sini.
     */
    function meiosis(uint256 a, uint256 b, uint256 seed)
        internal pure returns (uint256 child)
    {
        uint256 m1 = uint256(keccak256(abi.encode(seed, MUT_SALT_1)));
        uint256 m2 = uint256(keccak256(abi.encode(seed, MUT_SALT_2)));

        for (uint256 i = 0; i < LOCUS_COUNT; ++i) {
            uint16 la = getLocus(a, i);
            uint16 lb = getLocus(b, i);

            uint8 fromA = ((seed >> i) & 1) == 0 ? alleleX(la) : alleleY(la);
            uint8 fromB = ((seed >> (i + 16)) & 1) == 0 ? alleleX(lb) : alleleY(lb);

            uint8 count = traitCount(i);
            if (count > 1 && uint8(m1 >> (8 * i)) < MUTATION_THRESHOLD) {
                uint8 r2 = uint8(m2 >> (8 * i));
                // + 1 menjamin trait hasil mutasi selalu berbeda dari aslinya
                uint8 shift = 1 + ((r2 & 0x7f) % (count - 1));
                if (((r2 >> 7) & 1) == 1) {
                    fromB = makeAllele(dom(fromB), (trait(fromB) + shift) % count);
                } else {
                    fromA = makeAllele(dom(fromA), (trait(fromA) + shift) % count);
                }
            }

            child |= uint256((uint16(fromA) << 8) | uint16(fromB)) << (16 * i);
        }
    }

    /**
     * @notice Ekspresi fenotipe. Alel dengan dominance tertinggi menang;
     *         seri diputus oleh bit seed, sehingga hasilnya terkunci saat lahir.
     * @dev Alel dominance 0 hanya terekspresi bila lawannya juga 0 — itulah
     *      yang membuat trait bisa melompat satu generasi.
     */
    function express(uint256 genome, uint256 seed)
        internal pure returns (uint8[16] memory out)
    {
        for (uint256 i = 0; i < LOCUS_COUNT; ++i) {
            uint16 l = getLocus(genome, i);
            uint8 x = alleleX(l);
            uint8 y = alleleY(l);
            uint8 dx = dom(x);
            uint8 dy = dom(y);

            if (dx > dy) out[i] = trait(x);
            else if (dy > dx) out[i] = trait(y);
            else out[i] = ((seed >> i) & 1) == 0 ? trait(x) : trait(y);
        }
    }

    /// @notice Kekerabatan 0-255, dihitung dari alel yang sama-sama dimiliki.
    function relatedness(uint256 a, uint256 b) internal pure returns (uint8) {
        uint256 shared;
        for (uint256 i = 0; i < LOCUS_COUNT; ++i) {
            uint16 la = getLocus(a, i);
            uint16 lb = getLocus(b, i);
            uint8 ax = alleleX(la);
            uint8 ay = alleleY(la);
            uint8 bx = alleleX(lb);
            uint8 by = alleleY(lb);

            if ((ax == bx && ay == by) || (ax == by && ay == bx)) shared += 2;
            else if (ax == bx || ax == by || ay == bx || ay == by) shared += 1;
        }
        return uint8((shared * 255) / 32);
    }
}
