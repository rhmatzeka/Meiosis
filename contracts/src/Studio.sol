// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {GeneLib} from "./GeneLib.sol";

/**
 * @title Studio
 * @notice Siapa pun bisa merancang agent generasi nol dengan bebas: memilih
 *         nilai untuk setiap lokus, dan menulis instruksi khususnya sendiri.
 *
 * @dev Satu-satunya aturan: nilai tiap lokus harus trait yang sah untuk lokus
 *      itu (`GeneLib.traitCount`). Setiap lokus homozigot dengan dominansi 2,
 *      jadi sifat pilihan pasti terekspresi.
 *
 *      Soul (profil bebas + instruksi) adalah teks yang disimpan di luar chain;
 *      yang dicatat di sini hanya hash-nya, supaya instruksinya tetap rahasia
 *      tapi tidak bisa diganti diam-diam. Pemilik boleh menggantinya lewat
 *      setSoul (tercatat sebagai versi baru). Anak hasil kawin tanpa soul
 *      sendiri mewarisi profil kedua induknya di runtime.
 *
 *      Kembaran TypeScript-nya `studioGenome()` di packages/shared/src/studio.ts;
 *      keduanya diuji dengan vektor yang sama.
 */
contract Studio is Ownable, ReentrancyGuard, IERC721Receiver {
    uint8 private constant DOM = 2;

    AgentRegistry public immutable registry;
    uint256 public fee;
    mapping(uint64 => bool) public designed;
    /// @notice keccak256 profil + instruksi agent; 0 bila tidak ada.
    mapping(uint64 => bytes32) public soulOf;
    /// @notice Berapa kali soul agent ini ditetapkan (1 saat dibuat, bertambah setiap disunting).
    mapping(uint64 => uint32) public soulVersion;

    event Designed(uint64 indexed id, address indexed creator, uint256 genome, bytes32 soulHash);
    event FeeSet(uint256 fee);
    event SoulSet(uint64 indexed id, bytes32 soulHash, uint32 version);

    error BadTrait(uint256 locus, uint8 trait);
    error InsufficientFee(uint256 required, uint256 sent);
    error NotOwner(uint64 id);

    constructor(AgentRegistry registry_, uint256 fee_) Ownable(msg.sender) {
        registry = registry_;
        fee = fee_;
    }

    function preview(uint8[16] calldata traits) public pure returns (uint256 genome) {
        for (uint256 i = 0; i < 16; ++i) {
            if (traits[i] >= GeneLib.traitCount(i)) revert BadTrait(i, traits[i]);
            uint256 a = (uint256(DOM) << 6) | traits[i];
            genome |= ((a << 8) | a) << (16 * i);
        }
    }

    /**
     * @notice Membuat agent baru untuk pengirim. `manifestHash` dihitung klien
     *         dari genome yang sama; `soulHash` adalah keccak256 instruksi khususnya.
     */
    function create(uint8[16] calldata traits, string calldata name, uint64 manifestHash, bytes32 soulHash)
        external payable nonReentrant returns (uint64 id)
    {
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        uint256 genome = preview(traits);

        // Dicetak ke Studio dulu supaya nama bisa dipasang atas nama pemilik,
        // lalu diserahkan ke pembuatnya dalam transaksi yang sama.
        id = registry.mint(address(this), genome, 0, 0, 0);
        if (bytes(name).length > 0) registry.setName(id, name);
        if (manifestHash != 0) registry.setManifestHash(id, manifestHash);
        registry.transferFrom(address(this), msg.sender, id);
        designed[id] = true;
        emit Designed(id, msg.sender, genome, soulHash);
        if (soulHash != bytes32(0)) {
            soulOf[id] = soulHash;
            soulVersion[id] = 1;
            emit SoulSet(id, soulHash, 1);
        }

        uint256 refund = msg.value - fee;
        if (refund > 0) Address.sendValue(payable(msg.sender), refund);
    }

    /**
     * @notice Pemilik agent mengganti profil & instruksinya. DNA (genome) tidak
     *         berubah. Berlaku juga untuk anak hasil kawin: setelah disunting,
     *         anak memakai soul miliknya sendiri, bukan warisan leluhur.
     */
    function setSoul(uint64 id, bytes32 soulHash) external {
        if (registry.ownerOf(id) != msg.sender) revert NotOwner(id);
        soulOf[id] = soulHash;
        uint32 v = ++soulVersion[id];
        emit SoulSet(id, soulHash, v);
    }

    function setFee(uint256 fee_) external onlyOwner {
        fee = fee_;
        emit FeeSet(fee_);
    }

    function withdrawFees() external onlyOwner {
        Address.sendValue(payable(owner()), address(this).balance);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
