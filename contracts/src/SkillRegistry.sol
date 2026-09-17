// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {GeneLib} from "./GeneLib.sol";

/**
 * @title SkillRegistry
 * @notice Memetakan trait di genome ke modul skill yang nyata. Trait hanyalah
 *         angka; registry inilah yang memberinya arti.
 *
 * @dev Bersifat APPEND-ONLY dan sekali tulis per (lokus, trait). Ini bukan
 *      kehati-hatian berlebihan: `expand()` di runtime harus deterministik, dan
 *      kalau CID sebuah modul bisa berubah, genome yang sama akan menghasilkan
 *      manifest berbeda di waktu berbeda — seluruh klaim verifiability runtuh.
 *      Mengubah isi sebuah prompt berarti mendaftarkan traitId BARU, bukan
 *      menimpa yang lama. Lihat PLAN.md §7 dan §8.
 */
contract SkillRegistry is Ownable {
    struct Module {
        bytes32 cid;     // content id modul prompt
        uint32 toolMask; // bitmask tool/MCP yang diizinkan
        uint16 version;
        bool present;
        string name;
    }

    /// @dev kunci = (lokus << 8) | traitId
    mapping(uint16 => Module) private _modules;
    uint16 public moduleCount;

    event ModuleRegistered(
        uint8 indexed locus, uint8 indexed traitId, string name,
        bytes32 cid, uint32 toolMask, uint16 version
    );

    error BadLocus(uint8 locus);
    error TraitOutOfRange(uint8 locus, uint8 traitId, uint8 validCount);
    error AlreadyRegistered(uint8 locus, uint8 traitId);
    error NotRegistered(uint8 locus, uint8 traitId);

    constructor() Ownable(msg.sender) {}

    function key(uint8 locus, uint8 traitId) public pure returns (uint16) {
        return (uint16(locus) << 8) | uint16(traitId);
    }

    function register(
        uint8 locus, uint8 traitId, string calldata name,
        bytes32 cid, uint32 toolMask, uint16 version
    ) external onlyOwner {
        if (locus >= 16) revert BadLocus(locus);

        // Divalidasi langsung terhadap model genetik: trait yang tidak mungkin
        // muncul dari meiosis tidak boleh punya modul.
        uint8 valid = GeneLib.traitCount(locus);
        if (traitId >= valid) revert TraitOutOfRange(locus, traitId, valid);

        uint16 k = key(locus, traitId);
        if (_modules[k].present) revert AlreadyRegistered(locus, traitId);

        _modules[k] = Module({cid: cid, toolMask: toolMask, version: version, present: true, name: name});
        ++moduleCount;
        emit ModuleRegistered(locus, traitId, name, cid, toolMask, version);
    }

    function get(uint8 locus, uint8 traitId) external view returns (Module memory m) {
        m = _modules[key(locus, traitId)];
        if (!m.present) revert NotRegistered(locus, traitId);
    }

    function isRegistered(uint8 locus, uint8 traitId) external view returns (bool) {
        return _modules[key(locus, traitId)].present;
    }
}
