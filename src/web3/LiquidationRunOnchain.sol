// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title LiquidationRunOnchain
/// @notice Contract for:
/// - daily check-in (once a day)
/// - best result storing
contract LiquidationRunOnchain is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev player's last check-in day (timestamp / 1 days)
    mapping(address => uint32) public lastCheckInDay;

    /// @dev check-in streak
    mapping(address => uint32) public checkInStreakDays;

    /// @dev best result in ms
    mapping(address => uint32) public bestTimeMs;

    /// @dev signing server address
    address public signer;

    /// @dev check-in price
    uint256 public checkInPrice;

    /// @dev score submission price
    uint256 public submitScorePrice;

    /// @dev collector address
    address public collector;

    /// @dev nonce to prevent replay-attacks
    mapping(address => uint256) public nonces;

    event CheckedIn(address indexed player, uint32 indexed day, uint256 paid);
    event ScoreSubmitted(
        address indexed player,
        uint32 timeMs,
        bool isNewBest,
        uint256 paid
    );
    event ScoreSubmittedByOwner(
        address indexed player,
        uint32 timeMs,
        bool isNewBest
    );
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PricesUpdated(uint256 checkInPrice, uint256 submitScorePrice);
    event checkInPriceUpdated(uint256 oldCheckInPrice, uint256 newCheckInPrice);
    event submitScorePriceUpdated(uint256 oldSubmitScorePrice, uint256 newSubmitScorePrice);
    event CollectorUpdated(address indexed oldCollector, address indexed newCollector);

    error AlreadyCheckedInToday();
    error ZeroScore();
    error InvalidSignature();
    error InsufficientPayment();
    error ZeroAddress();

    constructor(
        address _signer,
        address _collector,
        uint256 _checkInPrice,
        uint256 _submitScorePrice
    ) Ownable(msg.sender) {
        if (_signer == address(0) || _collector == address(0)) revert ZeroAddress();
        signer = _signer;
        collector = _collector;
        checkInPrice = _checkInPrice;
        submitScorePrice = _submitScorePrice;
    }

    /// @notice Current contract day (UTC epoch days)
    function today() public view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    /// @notice Can check-in today
    function canCheckIn(address _player) external view returns (bool) {
        return lastCheckInDay[_player] != today();
    }

    /// @notice Get current streak
    /// @param _player Player address (uint32)
    function getCurrentStreak(address _player) external view returns (uint32) {
        if (lastCheckInDay[_player] < today() - 1)
          return 0;

        return checkInStreakDays[_player];
    }

    /// @notice Everyday check-in (once a day)
    function checkIn() external payable whenNotPaused nonReentrant {
        if (msg.value < checkInPrice) revert InsufficientPayment();

        uint32 day = today();
        if (lastCheckInDay[msg.sender] == day) revert AlreadyCheckedInToday();

        if (lastCheckInDay[msg.sender] == day - 1) {
            checkInStreakDays[msg.sender] += 1;
        } else {
            checkInStreakDays[msg.sender] = 1;
        }

        lastCheckInDay[msg.sender] = day;

        (bool sent, ) = collector.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit CheckedIn(msg.sender, day, msg.value);
    }

    /// @notice Save result. Server signature is required.
    /// @param _timeMs Play time in ms (uint32)
    /// @param _v, _r, _s ECDSA components of server signature
    function submitScore(
        uint32 _timeMs,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external payable whenNotPaused nonReentrant {
        if (_timeMs == 0) revert ZeroScore();
        if (msg.value < submitScorePrice) revert InsufficientPayment();

        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, _timeMs, nonces[msg.sender])
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address recovered = ecrecover(ethSignedMessageHash, _v, _r, _s);
        if (recovered != signer) revert InvalidSignature();

        nonces[msg.sender]++;

        uint32 prev = bestTimeMs[msg.sender];
        bool isNewBest = _timeMs > prev;
        if (isNewBest)
            bestTimeMs[msg.sender] = _timeMs;


        (bool sent, ) = collector.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit ScoreSubmitted(msg.sender, _timeMs, isNewBest, msg.value);
    }

    // ============ ADMIN-FUNCS ============

    /// @notice Change signer
    function setSigner(address _newSigner) external onlyOwner {
        if (_newSigner == address(0)) revert ZeroAddress();
        address oldSigner = signer;
        signer = _newSigner;
        emit SignerUpdated(oldSigner, _newSigner);
    }

    /// @notice Change prices
    function setPrices(
        uint256 _newCheckInPrice,
        uint256 _newSubmitScorePrice
    ) external onlyOwner {
        checkInPrice = _newCheckInPrice;
        submitScorePrice = _newSubmitScorePrice;
        emit PricesUpdated(_newCheckInPrice, _newSubmitScorePrice);
    }

    /// @notice Change check-in price
    function setCheckInPrice(uint256 _newCheckInPrice) external onlyOwner {
        uint256 oldCheckInPrice = checkInPrice;
        checkInPrice = _newCheckInPrice;
        emit checkInPriceUpdated(oldCheckInPrice, _newCheckInPrice);
    }

    /// @notice Change score submission price
    function setSubmitScorePrice(uint256 _newSubmitScorePrice) external onlyOwner {
        uint256 oldSubmitScorePrice = submitScorePrice;
        submitScorePrice = _newSubmitScorePrice;
        emit submitScorePriceUpdated(oldSubmitScorePrice, _newSubmitScorePrice);
    }

    /// @notice Change collector
    function setCollector(address _newCollector) external onlyOwner {
        if (_newCollector == address(0)) revert ZeroAddress();
        address oldCollector = collector;
        collector = _newCollector;
        emit CollectorUpdated(oldCollector, _newCollector);
    }

    /// @notice Save result by owner.
    /// @param _player Player addres (address)
    /// @param _timeMs Player time in ms (uint32)
    function submitScoreOwner(
        address _player,
        uint32 _timeMs
    ) external payable onlyOwner nonReentrant {
        if (_timeMs == 0) revert ZeroScore();

        uint32 prev = bestTimeMs[_player];
        bool isNewBest = _timeMs > prev;
        if (isNewBest)
            bestTimeMs[_player] = _timeMs;

        emit ScoreSubmittedByOwner(_player, _timeMs, isNewBest);
    }

    /// @notice Withdraw native tokens
    function withdraw() external onlyOwner {
        (bool sent, ) = collector.call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    /// @notice Withdraw ERC20 tokens
    function recoverERC20(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(collector, _amount);
    }

    /// @notice Pause contract
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause contract
    function unpause() external onlyOwner {
        _unpause();
    }
}
