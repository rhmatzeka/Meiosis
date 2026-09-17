// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title Genesis
 * @notice Mencetak generasi nol. Perkawinan butuh orang tua, tapi di awal belum
 *         ada siapa-siapa — keempat founder ini di-mint dengan genome yang
 *         dirancang tangan (lihat packages/shared/src/founders.ts).
 *
 * @dev Setelah `seal()`, generasi nol terkunci selamanya. Jalankan
 *      `bun run gene-sim` dan pastikan angkanya memuaskan SEBELUM menyegel —
 *      sesudahnya tidak ada jalan mundur. Lihat PLAN.md §19.1.
 */
contract Genesis is Ownable {
    uint8 public constant MAX_FOUNDERS = 4;

    AgentRegistry public immutable registry;
    uint8 public founderCount;
    bool public sealed_;

    mapping(uint64 => string) public founderName;

    event FounderMinted(uint64 indexed agentId, address indexed to, uint256 genome, string name);
    event Sealed();

    error AlreadySealed();
    error TooManyFounders();

    constructor(AgentRegistry registry_) Ownable(msg.sender) {
        registry = registry_;
    }

    function mintFounder(address to, uint256 genome, string calldata name)
        external onlyOwner returns (uint64 id)
    {
        if (sealed_) revert AlreadySealed();
        if (founderCount >= MAX_FOUNDERS) revert TooManyFounders();

        ++founderCount;
        id = registry.mint(to, genome, 0, 0, 0);
        founderName[id] = name;
        emit FounderMinted(id, to, genome, name);
    }

    /// @notice Menutup generasi nol. Tidak dapat dibatalkan.
    function seal() external onlyOwner {
        if (sealed_) revert AlreadySealed();
        sealed_ = true;
        emit Sealed();
    }
}
