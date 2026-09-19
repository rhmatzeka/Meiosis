// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {GeneLib} from "./GeneLib.sol";
import {LineageRoyalty} from "./LineageRoyalty.sol";

/**
 * @title Hatchery
 * @notice Perkawinan dengan commit-reveal: `breed()` menitipkan komitmen, dan
 *         `hatch()` beberapa blok kemudian barulah menghitung genome anak.
 *
 * @dev Kenapa dua langkah? Kalau `breed()` langsung mengembalikan anak di
 *      transaksi yang sama, penyerang bisa memanggilnya dari kontrak, memeriksa
 *      genome hasilnya, lalu `revert` bila jelek — diulang sampai dapat gen
 *      sempurna. Karena seed berasal dari blockhash blok masa depan, hasilnya
 *      tidak dapat disimulasi saat komitmen dibuat. Lihat PLAN.md §5.
 */
contract Hatchery is Ownable, ReentrancyGuard {
    /// @dev Jarak blok antara komitmen dan pengungkapan. "Masa kehamilan".
    uint32 public constant GESTATION_BLOCKS = 5;

    /// @dev EVM hanya menyimpan 256 blockhash terakhir.
    uint32 public constant BLOCKHASH_WINDOW = 256;

    AgentRegistry public immutable registry;

    /// @dev Stud fee tidak dikirim langsung ke pemilik, melainkan lewat royalti,
    ///      supaya leluhur sang pejantan ikut kebagian. Lihat LineageRoyalty.
    LineageRoyalty public immutable royalty;

    bytes32 private constant STUD_MEMO = "stud";

    uint32 public baseCooldownBlocks = 10;

    struct Pregnancy {
        uint64 parentA;
        uint64 parentB;
        uint32 revealBlock;
        bool hatched;
        address to;
    }

    uint64 public nextPregnancyId = 1;
    mapping(uint64 => Pregnancy) public pregnancies;
    mapping(uint64 => uint256) public studFee;
    mapping(uint64 => bool) public studListed;
    mapping(uint64 => uint32) public lastBredBlock;

    event Pregnant(
        uint64 indexed pregnancyId, uint64 indexed parentA, uint64 indexed parentB,
        address to, uint32 revealBlock
    );
    event Hatched(
        uint64 indexed childId, uint64 indexed parentA, uint64 indexed parentB,
        uint256 genome, uint256 seed, uint16 generation
    );
    event Rerolled(uint64 indexed pregnancyId, uint32 newRevealBlock);
    event StudListed(uint64 indexed agentId, uint256 fee);
    event StudUnlisted(uint64 indexed agentId);

    error SameParent();
    error NoSuchAgent(uint64 id);
    error NoSuchPregnancy(uint64 pid);
    error AlreadyHatched(uint64 pid);
    error StillGestating(uint32 revealBlock, uint256 current);
    error BlockhashExpired(uint64 pid);
    error NotExpiredYet(uint64 pid);
    error NotListedForStud(uint64 id);
    error InsufficientFee(uint256 required, uint256 sent);
    error OnCooldown(uint64 id, uint256 readyAt);
    error NotOwner(uint64 id);

    constructor(AgentRegistry registry_, LineageRoyalty royalty_) Ownable(msg.sender) {
        registry = registry_;
        royalty = royalty_;
    }

    // ---------------------------------------------------------------
    // Pasar pejantan
    // ---------------------------------------------------------------

    function listForStud(uint64 id, uint256 fee) external {
        if (registry.ownerOf(id) != msg.sender) revert NotOwner(id);
        studListed[id] = true;
        studFee[id] = fee;
        emit StudListed(id, fee);
    }

    function unlistStud(uint64 id) external {
        if (registry.ownerOf(id) != msg.sender) revert NotOwner(id);
        studListed[id] = false;
        emit StudUnlisted(id);
    }

    /// @notice Jeda breeding menggandakan diri tiap kali agent kawin, dibatasi 64x.
    function cooldownBlocks(uint64 id) public view returns (uint32) {
        uint16 n = registry.breedCountOf(id);
        if (n > 6) n = 6;
        return uint32(baseCooldownBlocks << n);
    }

    function readyAt(uint64 id) public view returns (uint256) {
        uint32 last = lastBredBlock[id];
        if (last == 0) return 0;
        return uint256(last) + cooldownBlocks(id);
    }

    function setBaseCooldown(uint32 blocks_) external onlyOwner {
        baseCooldownBlocks = blocks_;
    }

    // ---------------------------------------------------------------
    // Perkawinan
    // ---------------------------------------------------------------

    function breed(uint64 a, uint64 b) external payable nonReentrant returns (uint64 pid) {
        if (a == b) revert SameParent();
        if (!registry.exists(a)) revert NoSuchAgent(a);
        if (!registry.exists(b)) revert NoSuchAgent(b);

        _requireOffCooldown(a);
        _requireOffCooldown(b);

        uint256 costA = _accessCost(a);
        uint256 costB = _accessCost(b);
        uint256 due = costA + costB;
        if (msg.value < due) revert InsufficientFee(due, msg.value);

        // efek dulu, interaksi belakangan
        lastBredBlock[a] = uint32(block.number);
        lastBredBlock[b] = uint32(block.number);
        registry.recordBreed(a);
        registry.recordBreed(b);

        pid = nextPregnancyId++;
        uint32 reveal = uint32(block.number) + GESTATION_BLOCKS;
        pregnancies[pid] = Pregnancy({
            parentA: a, parentB: b, revealBlock: reveal, hatched: false, to: msg.sender
        });
        emit Pregnant(pid, a, b, msg.sender, reveal);

        if (costA > 0) royalty.pay{value: costA}(a, STUD_MEMO);
        if (costB > 0) royalty.pay{value: costB}(b, STUD_MEMO);
        uint256 refund = msg.value - due;
        if (refund > 0) Address.sendValue(payable(msg.sender), refund);
    }

    /**
     * @notice Menetaskan kehamilan. Genome anak baru dihitung di sini, dari
     *         blockhash yang saat komitmen dibuat belum ada.
     */
    function hatch(uint64 pid) external nonReentrant returns (uint64 childId) {
        Pregnancy storage p = pregnancies[pid];
        if (p.parentA == 0) revert NoSuchPregnancy(pid);
        if (p.hatched) revert AlreadyHatched(pid);
        if (block.number <= p.revealBlock) revert StillGestating(p.revealBlock, block.number);

        bytes32 bh = blockhash(p.revealBlock);
        if (bh == bytes32(0)) revert BlockhashExpired(pid);

        p.hatched = true;

        uint256 seed = uint256(keccak256(abi.encode(bh, pid)));
        uint256 genome = GeneLib.meiosis(registry.genomeOf(p.parentA), registry.genomeOf(p.parentB), seed);

        uint16 genA = registry.generationOf(p.parentA);
        uint16 genB = registry.generationOf(p.parentB);
        uint16 generation = (genA > genB ? genA : genB) + 1;

        childId = registry.mint(p.to, genome, p.parentA, p.parentB, generation);
        emit Hatched(childId, p.parentA, p.parentB, genome, seed, generation);
    }

    /**
     * @notice Menjadwalkan ulang kehamilan yang blockhash-nya sudah kedaluwarsa.
     * @dev Tanpa fungsi ini, kehamilan yang tidak ditetaskan dalam ~50 menit akan
     *      tersangkut selamanya: seed-nya tidak akan pernah bisa dihitung lagi.
     */
    function reroll(uint64 pid) external {
        Pregnancy storage p = pregnancies[pid];
        if (p.parentA == 0) revert NoSuchPregnancy(pid);
        if (p.hatched) revert AlreadyHatched(pid);
        if (block.number <= uint256(p.revealBlock) + BLOCKHASH_WINDOW) revert NotExpiredYet(pid);

        uint32 reveal = uint32(block.number) + GESTATION_BLOCKS;
        p.revealBlock = reveal;
        emit Rerolled(pid, reveal);
    }

    // ---------------------------------------------------------------

    function _requireOffCooldown(uint64 id) internal view {
        uint256 ready = readyAt(id);
        if (block.number < ready) revert OnCooldown(id, ready);
    }

    function _accessCost(uint64 id) internal view returns (uint256) {
        if (registry.ownerOf(id) == msg.sender) return 0;
        if (!studListed[id]) revert NotListedForStud(id);
        return studFee[id];
    }
}
