// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Confidential city builder with encrypted balances and choices
/// @notice Players join with encrypted gold and place encrypted building types on a 3x3 grid.
contract ConfidentialGame is ZamaEthereumConfig {
    uint8 public constant GRID_WIDTH = 3;
    uint8 public constant GRID_SIZE = GRID_WIDTH * GRID_WIDTH;
    uint64 public constant STARTING_GOLD = 10_000;

    // Status codes: 0 = success, 1 = invalid building, 2 = tile occupied, 3 = insufficient funds.
    uint8 private constant STATUS_SUCCESS = 0;
    uint8 private constant STATUS_INVALID_BUILDING = 1;
    uint8 private constant STATUS_TILE_TAKEN = 2;
    uint8 private constant STATUS_NO_FUNDS = 3;

    mapping(address => bool) private _hasJoined;
    mapping(address => euint64) private _balances;
    mapping(address => mapping(uint8 => euint8)) private _buildings;
    mapping(address => euint8) private _lastPlacementStatus;

    event PlayerJoined(address indexed player);
    event BuildingPlaced(address indexed player, uint8 position);

    error AlreadyJoined();
    error NotJoined();
    error InvalidPosition(uint8 position);

    /// @notice Join the game and receive encrypted starting gold plus an empty grid.
    function joinGame() external {
        if (_hasJoined[msg.sender]) {
            revert AlreadyJoined();
        }
        _hasJoined[msg.sender] = true;

        euint64 startingGold = FHE.asEuint64(STARTING_GOLD);
        _balances[msg.sender] = startingGold;
        FHE.allowThis(startingGold);
        FHE.allow(startingGold, msg.sender);

        euint8 emptyTile = FHE.asEuint8(0);
        for (uint8 i = 0; i < GRID_SIZE; i++) {
            _buildings[msg.sender][i] = emptyTile;
            FHE.allowThis(emptyTile);
            FHE.allow(emptyTile, msg.sender);
        }

        euint8 status = FHE.asEuint8(STATUS_SUCCESS);
        _lastPlacementStatus[msg.sender] = status;
        FHE.allowThis(status);
        FHE.allow(status, msg.sender);

        emit PlayerJoined(msg.sender);
    }

    /// @notice Place an encrypted building on a grid position, consuming encrypted gold.
    /// @param position Tile index from 0 to 8 (left-to-right, top-to-bottom).
    /// @param buildingType Encrypted building id (1-4).
    /// @param inputProof Proof matching the encrypted input.
    function placeBuilding(uint8 position, externalEuint8 buildingType, bytes calldata inputProof) external {
        if (!_hasJoined[msg.sender]) {
            revert NotJoined();
        }
        if (position >= GRID_SIZE) {
            revert InvalidPosition(position);
        }

        euint8 encryptedType = FHE.fromExternal(buildingType, inputProof);
        euint64 cost = _buildingCost(encryptedType);
        ebool isValid = _isValidBuilding(encryptedType);

        euint8 existing = _buildings[msg.sender][position];
        ebool isEmpty = FHE.eq(existing, FHE.asEuint8(0));

        euint64 balance = _balances[msg.sender];
        ebool hasFunds = FHE.ge(balance, cost);

        ebool canPlace = FHE.and(isValid, FHE.and(isEmpty, hasFunds));

        euint8 resultingBuilding = FHE.select(canPlace, encryptedType, existing);
        _buildings[msg.sender][position] = resultingBuilding;
        FHE.allowThis(resultingBuilding);
        FHE.allow(resultingBuilding, msg.sender);

        euint64 spend = FHE.select(canPlace, cost, FHE.asEuint64(0));
        euint64 updatedBalance = FHE.sub(balance, spend);
        _balances[msg.sender] = updatedBalance;
        FHE.allowThis(updatedBalance);
        FHE.allow(updatedBalance, msg.sender);

        euint8 status = _placementStatus(isValid, isEmpty, hasFunds, canPlace);
        _lastPlacementStatus[msg.sender] = status;
        FHE.allowThis(status);
        FHE.allow(status, msg.sender);

        emit BuildingPlaced(msg.sender, position);
    }

    /// @notice Encrypted balance for a player.
    function getBalance(address player) external view returns (euint64) {
        return _balances[player];
    }

    /// @notice Encrypted building type for a specific tile.
    function getBuilding(address player, uint8 position) external view returns (euint8) {
        if (position >= GRID_SIZE) {
            revert InvalidPosition(position);
        }
        return _buildings[player][position];
    }

    /// @notice Encrypted grid for a player.
    function getBoard(address player) external view returns (euint8[GRID_SIZE] memory board) {
        for (uint8 i = 0; i < GRID_SIZE; i++) {
            board[i] = _buildings[player][i];
        }
    }

    /// @notice Encrypted status from the last placement attempt.
    function getLastPlacementStatus(address player) external view returns (euint8) {
        return _lastPlacementStatus[player];
    }

    /// @notice Returns whether a player has joined.
    function hasJoined(address player) external view returns (bool) {
        return _hasJoined[player];
    }

    function _isValidBuilding(euint8 buildingType) internal returns (ebool) {
        ebool isOne = FHE.eq(buildingType, FHE.asEuint8(1));
        ebool isTwo = FHE.eq(buildingType, FHE.asEuint8(2));
        ebool isThree = FHE.eq(buildingType, FHE.asEuint8(3));
        ebool isFour = FHE.eq(buildingType, FHE.asEuint8(4));

        return FHE.or(FHE.or(isOne, isTwo), FHE.or(isThree, isFour));
    }

    function _buildingCost(euint8 buildingType) internal returns (euint64) {
        euint64 cost = FHE.asEuint64(0);

        cost = FHE.select(FHE.eq(buildingType, FHE.asEuint8(1)), FHE.asEuint64(100), cost);
        cost = FHE.select(FHE.eq(buildingType, FHE.asEuint8(2)), FHE.asEuint64(200), cost);
        cost = FHE.select(FHE.eq(buildingType, FHE.asEuint8(3)), FHE.asEuint64(400), cost);
        cost = FHE.select(FHE.eq(buildingType, FHE.asEuint8(4)), FHE.asEuint64(1000), cost);

        return cost;
    }

    function _placementStatus(
        ebool isValid,
        ebool isEmpty,
        ebool hasFunds,
        ebool canPlace
    ) internal returns (euint8) {
        euint8 status = FHE.asEuint8(STATUS_SUCCESS);
        status = FHE.select(FHE.eq(isValid, FHE.asEbool(false)), FHE.asEuint8(STATUS_INVALID_BUILDING), status);

        ebool tileBlocked = FHE.and(FHE.eq(isValid, FHE.asEbool(true)), FHE.eq(isEmpty, FHE.asEbool(false)));
        status = FHE.select(tileBlocked, FHE.asEuint8(STATUS_TILE_TAKEN), status);

        ebool fundsCheckRequired = FHE.and(FHE.eq(isValid, FHE.asEbool(true)), FHE.eq(isEmpty, FHE.asEbool(true)));
        ebool lacksFunds = FHE.and(fundsCheckRequired, FHE.eq(hasFunds, FHE.asEbool(false)));
        status = FHE.select(lacksFunds, FHE.asEuint8(STATUS_NO_FUNDS), status);

        status = FHE.select(canPlace, FHE.asEuint8(STATUS_SUCCESS), status);
        return status;
    }
}
