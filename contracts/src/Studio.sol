// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title Studio
 * @notice Siapa pun bisa merancang agent generasi nol dari pilihan sederhana
 *         (keahlian, stack, gaya bicara, dua bakat), dengan membayar biaya kecil.
 *
 * @dev Aturan yang menjaga perkawinan tetap berharga, dipaksakan di sini dan
 *      bukan di UI:
 *        - setiap lokus homozigot dengan dominansi 1, sehingga kalah dari alel
 *          founder (dominansi 2–3) saat dikawinkan;
 *        - otak paling tinggi "seimbang" — otak "kuat" hanya lewat keturunan;
 *        - paling banyak dua bakat, masing-masing dari estetika (4), ketelitian
 *          tes (5), keamanan (6), ketekunan (14).
 *
 *      Kembaran TypeScript-nya `studioGenome()` di packages/shared/src/studio.ts;
 *      keduanya diuji dengan vektor yang sama.
 */
contract Studio is Ownable, ReentrancyGuard, IERC721Receiver {
    struct Design {
        uint8 tier;       // 0 cepat, 1 seimbang
        uint8 discipline; // 0..5
        uint8 stack;      // 0..3
        uint8 verbosity;  // 0..2
        uint8 talentA;    // 4, 5, 6, 14, atau 255 = tanpa bakat
        uint8 talentB;
    }

    uint8 public constant NO_TALENT = 255;
    uint8 private constant DOM = 1;

    AgentRegistry public immutable registry;
    uint256 public fee;
    mapping(uint64 => bool) public designed;

    event Designed(uint64 indexed id, address indexed creator, uint256 genome);
    event FeeSet(uint256 fee);

    error BadDesign();
    error InsufficientFee(uint256 required, uint256 sent);

    constructor(AgentRegistry registry_, uint256 fee_) Ownable(msg.sender) {
        registry = registry_;
        fee = fee_;
    }

    function preview(Design calldata d) public pure returns (uint256 genome) {
        _validate(d);
        uint8[16] memory v;
        v[0] = d.tier;
        v[1] = d.discipline;
        v[2] = 0;
        v[3] = d.stack;
        v[4] = _talent(d, 4);
        v[5] = _talent(d, 5);
        v[6] = _talent(d, 6);
        v[7] = 1;
        v[8] = 1;
        v[9] = 3;
        v[10] = 0;
        v[11] = d.verbosity;
        v[12] = 1;
        v[13] = 1;
        v[14] = _talent(d, 14);
        v[15] = 0;
        for (uint256 i = 0; i < 16; ++i) {
            uint256 a = (uint256(DOM) << 6) | v[i];
            genome |= ((a << 8) | a) << (16 * i);
        }
    }

    /**
     * @notice Membuat agent baru untuk pengirim. `manifestHash` dihitung klien
     *         dari genome yang sama (server/UI memakai studioGenome + expand).
     */
    function create(Design calldata d, string calldata name, uint64 manifestHash)
        external payable nonReentrant returns (uint64 id)
    {
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        uint256 genome = preview(d);

        // Dicetak ke Studio dulu supaya nama bisa dipasang atas nama pemilik,
        // lalu diserahkan ke pembuatnya dalam transaksi yang sama.
        id = registry.mint(address(this), genome, 0, 0, 0);
        if (bytes(name).length > 0) registry.setName(id, name);
        if (manifestHash != 0) registry.setManifestHash(id, manifestHash);
        registry.transferFrom(address(this), msg.sender, id);
        designed[id] = true;
        emit Designed(id, msg.sender, genome);

        uint256 refund = msg.value - fee;
        if (refund > 0) Address.sendValue(payable(msg.sender), refund);
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

    function _talent(Design calldata d, uint8 locus) private pure returns (uint8) {
        return d.talentA == locus || d.talentB == locus ? 2 : 1;
    }

    function _isTalent(uint8 t) private pure returns (bool) {
        return t == NO_TALENT || t == 4 || t == 5 || t == 6 || t == 14;
    }

    function _validate(Design calldata d) private pure {
        if (d.tier > 1 || d.discipline > 5 || d.stack > 3 || d.verbosity > 2) revert BadDesign();
        if (!_isTalent(d.talentA) || !_isTalent(d.talentB)) revert BadDesign();
        if (d.talentA == d.talentB && d.talentA != NO_TALENT) revert BadDesign();
    }
}
