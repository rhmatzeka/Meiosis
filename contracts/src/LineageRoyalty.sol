// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title LineageRoyalty
 * @notice Setiap pembayaran kepada seorang agent — sewa kerja maupun stud fee —
 *         mengalir sebagian ke pemilik leluhurnya. Inilah yang membuat memilih
 *         induk yang baik bernilai uang: keturunan yang laris terus membayar
 *         pemilik garis darahnya.
 *
 * @dev Bagian per generasi leluhur, dibagi rata di antara leluhur pada generasi itu:
 *
 *        induk (2)          5%      → masing-masing 2,5%
 *        kakek-nenek (≤4)   2,5%
 *        buyut (≤8)         1,25%
 *        canggah (≤16)      0,62%
 *
 *      Totalnya paling banyak 9,37%; sisanya untuk pemilik agent itu sendiri.
 *      Founder tidak punya induk, jadi pembayaran ke founder utuh ke pemiliknya.
 *
 *      Pembayaran memakai pola tarik (pull): saldo dikreditkan, lalu ditarik
 *      sendiri lewat `withdraw()`. Mengirim ETH langsung ke hingga 31 alamat
 *      dalam satu transaksi berarti satu penerima yang menolak ETH bisa
 *      menggagalkan semua pembayaran — termasuk perkawinan orang lain.
 *
 *      Lihat PLAN.md §6.5.
 */
contract LineageRoyalty is ReentrancyGuard {
    uint8 public constant MAX_DEPTH = 4;
    uint16 private constant BPS = 10_000;

    AgentRegistry public immutable registry;

    mapping(address => uint256) public pending;

    /// @notice Pembayaran masuk untuk seorang agent. `memo` membedakan sewa dari stud fee.
    event Paid(uint64 indexed agentId, address indexed payer, uint256 amount, bytes32 memo);
    event RoyaltyCredited(
        uint64 indexed fromAgent, uint64 indexed ancestor, address indexed to, uint8 depth, uint256 amount
    );
    event Withdrawn(address indexed to, uint256 amount);

    error NoSuchAgent(uint64 id);
    error NothingToWithdraw();

    constructor(AgentRegistry registry_) {
        registry = registry_;
    }

    /// @notice Bagian satu generasi leluhur dalam basis poin: 500, 250, 125, 62.
    function levelBps(uint8 depth) public pure returns (uint256) {
        return 1000 >> depth; // depth 1 → 500
    }

    /**
     * @notice Membayar seorang agent. Bagian leluhur dikreditkan ke pemilik
     *         mereka saat ini; sisanya ke pemilik agent itu.
     */
    function pay(uint64 agentId, bytes32 memo) external payable nonReentrant {
        if (!registry.exists(agentId)) revert NoSuchAgent(agentId);
        emit Paid(agentId, msg.sender, msg.value, memo);
        if (msg.value == 0) return;

        uint256 given = _creditAncestors(agentId, msg.value);
        pending[registry.ownerOf(agentId)] += msg.value - given;
    }

    function _creditAncestors(uint64 agentId, uint256 amount) internal returns (uint256 given) {
        uint64[] memory one = new uint64[](1);
        one[0] = agentId;
        uint64[] memory level = _parentsOf(one);

        for (uint8 depth = 1; depth <= MAX_DEPTH && level.length > 0; ++depth) {
            uint256 share = (amount * levelBps(depth)) / BPS / level.length;
            if (share == 0) break; // generasi berikutnya pasti lebih kecil lagi
            for (uint256 i = 0; i < level.length; ++i) {
                address to = registry.ownerOf(level[i]);
                pending[to] += share;
                emit RoyaltyCredited(agentId, level[i], to, depth, share);
            }
            given += share * level.length;
            level = _parentsOf(level);
        }
    }

    /// @dev Seluruh induk dari satu generasi. Leluhur yang sama bisa muncul dua kali
    ///      bila ada perkawinan sekerabat — dan memang dihitung dua kali, karena ia
    ///      menyumbang dua kali ke garis darah itu.
    function _parentsOf(uint64[] memory level) internal view returns (uint64[] memory next) {
        next = new uint64[](level.length * 2);
        uint256 m;
        for (uint256 i = 0; i < level.length; ++i) {
            (uint64 a, uint64 b) = registry.parentsOf(level[i]);
            if (a != 0) next[m++] = a;
            if (b != 0) next[m++] = b;
        }
        assembly { mstore(next, m) }
    }

    function withdraw() external nonReentrant {
        uint256 amt = pending[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        pending[msg.sender] = 0;
        emit Withdrawn(msg.sender, amt);
        Address.sendValue(payable(msg.sender), amt);
    }
}
