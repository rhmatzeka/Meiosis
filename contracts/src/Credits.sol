// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Market} from "./Market.sol";

/**
 * @title Credits
 * @notice Saldo pakai untuk memakai agent dari luar web (Claude Code lewat MCP).
 *         Pengguna menyetor ETH sekali; setiap tugas memotong harga sewa agent itu.
 *
 * @dev Server Meiosis (operator) yang memotong, karena dialah yang menjalankan
 *      agent. Kepercayaan pada operator dibatasi di sini:
 *        - satu potongan paling besar harga sewa satu tugas agent itu
 *          (harga pemilik di Market, atau `defaultPrice` bila pemilik tidak memasang);
 *        - satu `job` hanya bisa ditagih sekali;
 *        - setiap potongan dicatat publik lewat event `Spent`;
 *        - saldo yang belum terpakai bisa ditarik pemiliknya kapan saja.
 *      Uangnya diteruskan lewat `Market.rent`, sehingga biaya platform dan
 *      royalti leluhur sama persis dengan sewa di web.
 */
contract Credits is Ownable, ReentrancyGuard {
    Market public immutable market;
    address public operator;
    uint256 public defaultPrice;

    mapping(address => uint256) public balanceOf;
    mapping(bytes32 => bool) public usedJob;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Spent(address indexed user, uint64 indexed agentId, bytes32 indexed job, uint256 amount);
    event OperatorSet(address operator);
    event DefaultPriceSet(uint256 price);

    error NotOperator();
    error InsufficientBalance(uint256 required, uint256 available);
    error OverPrice(uint256 amount, uint256 max);
    error JobUsed(bytes32 job);

    constructor(Market market_, address operator_, uint256 defaultPrice_) Ownable(msg.sender) {
        market = market_;
        operator = operator_;
        defaultPrice = defaultPrice_;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        uint256 bal = balanceOf[msg.sender];
        if (amount > bal) revert InsufficientBalance(amount, bal);
        balanceOf[msg.sender] = bal - amount;
        emit Withdrawn(msg.sender, amount);
        Address.sendValue(payable(msg.sender), amount);
    }

    /// @notice Harga paling tinggi satu tugas untuk agent ini.
    function maxPrice(uint64 agentId) public view returns (uint256) {
        uint256 own = market.rentPrice(agentId);
        return own > 0 ? own : defaultPrice;
    }

    function spend(address user, uint64 agentId, uint256 amount, bytes32 job) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        uint256 max = maxPrice(agentId);
        if (amount == 0 || amount > max) revert OverPrice(amount, max);
        if (usedJob[job]) revert JobUsed(job);
        uint256 bal = balanceOf[user];
        if (amount > bal) revert InsufficientBalance(amount, bal);

        usedJob[job] = true;
        balanceOf[user] = bal - amount;
        emit Spent(user, agentId, job, amount);
        market.rent{value: amount}(agentId, job);
    }

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setDefaultPrice(uint256 price) external onlyOwner {
        defaultPrice = price;
        emit DefaultPriceSet(price);
    }
}
