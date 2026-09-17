// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @notice Setiap agent Meiosis adalah satu NFT yang menyimpan genome dan silsilahnya.
 *
 * @dev Struct Agent sengaja dipadatkan ke tepat dua storage slot:
 *      slot 1 genome, slot 2 sisanya (64+64+32+16+16+64 = 256 bit).
 *      Lihat PLAN.md §6.1.
 */
contract AgentRegistry is ERC721, Ownable {
    struct Agent {
        uint256 genome;
        uint64 parentA;      // 0 = generasi nol
        uint64 parentB;
        uint32 birthBlock;
        uint16 generation;
        uint16 breedCount;
        uint64 manifestHash; // 8 byte pertama hash manifest runtime
    }

    /// @dev Token id dimulai dari 1 agar 0 bisa dipakai sebagai penanda "tanpa parent".
    uint64 public nextId = 1;

    mapping(uint64 => Agent) private _agents;
    mapping(address => bool) public isMinter;

    event AgentMinted(
        uint64 indexed id, address indexed to, uint256 genome,
        uint64 indexed parentA, uint64 parentB, uint16 generation
    );
    event ManifestSet(uint64 indexed id, uint64 manifestHash);
    event MinterSet(address indexed who, bool allowed);

    error NotMinter();
    error NoSuchAgent(uint64 id);
    error ManifestAlreadySet(uint64 id);

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert NotMinter();
        _;
    }

    constructor() ERC721("Meiosis Agent", "AGENT") Ownable(msg.sender) {}

    function setMinter(address who, bool allowed) external onlyOwner {
        isMinter[who] = allowed;
        emit MinterSet(who, allowed);
    }

    function mint(address to, uint256 genome, uint64 parentA, uint64 parentB, uint16 generation)
        external onlyMinter returns (uint64 id)
    {
        id = nextId++;
        _agents[id] = Agent({
            genome: genome,
            parentA: parentA,
            parentB: parentB,
            birthBlock: uint32(block.number),
            generation: generation,
            breedCount: 0,
            manifestHash: 0
        });
        _safeMint(to, id);
        emit AgentMinted(id, to, genome, parentA, parentB, generation);
    }

    /**
     * @notice Mencatat hash manifest yang dihasilkan runtime dari genome agent ini.
     * @dev Hanya boleh sekali. Inilah yang memungkinkan siapa pun membuktikan bahwa
     *      agent yang dijalankan memang agent yang tercatat di sini — lihat PLAN.md §8.
     */
    function setManifestHash(uint64 id, uint64 manifestHash) external {
        if (_ownerOf(id) == address(0)) revert NoSuchAgent(id);
        if (_agents[id].manifestHash != 0) revert ManifestAlreadySet(id);
        if (msg.sender != _ownerOf(id) && !isMinter[msg.sender]) revert NotMinter();
        _agents[id].manifestHash = manifestHash;
        emit ManifestSet(id, manifestHash);
    }

    function recordBreed(uint64 id) external onlyMinter {
        ++_agents[id].breedCount;
    }

    function exists(uint64 id) public view returns (bool) {
        return _ownerOf(id) != address(0);
    }

    function agentOf(uint64 id) external view returns (Agent memory) {
        if (!exists(id)) revert NoSuchAgent(id);
        return _agents[id];
    }

    function genomeOf(uint64 id) external view returns (uint256) {
        if (!exists(id)) revert NoSuchAgent(id);
        return _agents[id].genome;
    }

    function generationOf(uint64 id) external view returns (uint16) {
        if (!exists(id)) revert NoSuchAgent(id);
        return _agents[id].generation;
    }

    function breedCountOf(uint64 id) external view returns (uint16) {
        return _agents[id].breedCount;
    }

    function totalMinted() external view returns (uint64) {
        return nextId - 1;
    }
}
