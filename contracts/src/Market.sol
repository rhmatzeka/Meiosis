// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {LineageRoyalty} from "./LineageRoyalty.sol";

/**
 * @title Market
 * @notice Jual-beli dan sewa agent.
 *
 * @dev Setiap pembayaran — harga jual atau sewa satu tugas — dipotong biaya
 *      platform (`feeBps`, paling tinggi 10%), lalu sisanya lewat
 *      `LineageRoyalty.pay`, sehingga leluhur agent ikut menerima bagian dengan
 *      aturan yang sama seperti tarif kawin. Pada penjualan, royalti dibayar
 *      SEBELUM agent dipindahkan, jadi bagian pemilik jatuh ke penjual.
 *
 *      Listing tidak menahan agent (tanpa escrow): penjual cukup memberi izin
 *      transfer ke kontrak ini. Listing dianggap basi begitu pemilik agent
 *      bukan lagi penjualnya, misalnya karena dipindahkan di luar pasar.
 */
contract Market is Ownable, ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price;
    }

    uint16 private constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    bytes32 private constant SALE = "SALE";
    bytes32 private constant RENT = "RENT";

    AgentRegistry public immutable registry;
    LineageRoyalty public immutable royalty;

    uint16 public feeBps;
    uint256 public fees;
    mapping(uint64 => Listing) private _listings;
    /// @notice Harga sewa per tugas yang dipasang pemilik. 0 = pakai harga bawaan platform.
    mapping(uint64 => uint256) public rentPrice;

    event Listed(uint64 indexed id, address indexed seller, uint256 price);
    event Cancelled(uint64 indexed id);
    event Sold(uint64 indexed id, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event RentPriceSet(uint64 indexed id, uint256 price);
    event Rented(uint64 indexed id, address indexed payer, uint256 amount, bytes32 job);

    error NotOwner(uint64 id);
    error NotApproved(uint64 id);
    error ZeroPrice();
    error NotListed(uint64 id);
    error StaleListing(uint64 id);
    error OwnListing(uint64 id);
    error InsufficientPayment(uint256 required, uint256 sent);
    error FeeTooHigh();

    constructor(AgentRegistry registry_, LineageRoyalty royalty_, uint16 feeBps_) Ownable(msg.sender) {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        registry = registry_;
        royalty = royalty_;
        feeBps = feeBps_;
    }

    // ---------------------------------------------------------------- jual

    function list(uint64 id, uint256 price) external {
        address owner_ = registry.ownerOf(id);
        if (owner_ != msg.sender) revert NotOwner(id);
        if (price == 0) revert ZeroPrice();
        if (!_approved(owner_, id)) revert NotApproved(id);
        _listings[id] = Listing(msg.sender, price);
        emit Listed(id, msg.sender, price);
    }

    function cancel(uint64 id) external {
        Listing memory l = _listings[id];
        if (l.price == 0) revert NotListed(id);
        if (msg.sender != l.seller && msg.sender != registry.ownerOf(id)) revert NotOwner(id);
        delete _listings[id];
        emit Cancelled(id);
    }

    function buy(uint64 id) external payable nonReentrant {
        Listing memory l = _listings[id];
        if (l.price == 0) revert NotListed(id);
        address owner_ = registry.ownerOf(id);
        if (owner_ != l.seller || !_approved(owner_, id)) revert StaleListing(id);
        if (msg.sender == l.seller) revert OwnListing(id);
        if (msg.value < l.price) revert InsufficientPayment(l.price, msg.value);

        delete _listings[id];
        delete rentPrice[id];

        uint256 fee = (l.price * feeBps) / BPS;
        fees += fee;
        royalty.pay{value: l.price - fee}(id, SALE);
        registry.safeTransferFrom(l.seller, msg.sender, id);
        emit Sold(id, l.seller, msg.sender, l.price, fee);

        uint256 refund = msg.value - l.price;
        if (refund > 0) Address.sendValue(payable(msg.sender), refund);
    }

    function listingOf(uint64 id) external view returns (address seller, uint256 price, bool valid) {
        Listing memory l = _listings[id];
        seller = l.seller;
        price = l.price;
        valid = l.price > 0 && registry.ownerOf(id) == l.seller && _approved(l.seller, id);
    }

    // ---------------------------------------------------------------- sewa

    function setRentPrice(uint64 id, uint256 price) external {
        if (registry.ownerOf(id) != msg.sender) revert NotOwner(id);
        rentPrice[id] = price;
        emit RentPriceSet(id, price);
    }

    /**
     * @notice Membayar satu tugas untuk agent `id`. `job` mengikat pembayaran ke
     *         satu pekerjaan, supaya server bisa menolak bukti bayar yang dipakai ulang.
     */
    function rent(uint64 id, bytes32 job) external payable nonReentrant {
        uint256 min = rentPrice[id] > 0 ? rentPrice[id] : 1;
        if (msg.value < min) revert InsufficientPayment(min, msg.value);
        uint256 fee = (msg.value * feeBps) / BPS;
        fees += fee;
        royalty.pay{value: msg.value - fee}(id, RENT);
        emit Rented(id, msg.sender, msg.value, job);
    }

    // ---------------------------------------------------------------- platform

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
    }

    function withdrawFees() external onlyOwner {
        uint256 amt = fees;
        fees = 0;
        Address.sendValue(payable(owner()), amt);
    }

    function _approved(address owner_, uint64 id) private view returns (bool) {
        return registry.getApproved(id) == address(this) || registry.isApprovedForAll(owner_, address(this));
    }
}
