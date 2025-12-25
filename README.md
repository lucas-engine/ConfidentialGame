# Confidential Game

Confidential Game is a privacy-preserving city builder powered by Zama FHEVM. Players join to receive encrypted gold,
place encrypted building types on a 3x3 grid, and selectively decrypt their own progress. The game logic and state live
entirely on-chain while keeping player strategy and balances confidential.

## Goals

- Build a minimal but complete on-chain game that keeps player choices private.
- Demonstrate end-to-end FHE gameplay: encrypted input, encrypted state, and user-controlled decryption.
- Provide a clean separation between on-chain rules and a React UI that can operate without any mock data.

## Problem This Solves

Public blockchains expose all user actions and balances. For strategy games this creates immediate disadvantages:
everyone can see your resources, your map, and your next move. Confidential Game addresses that by encrypting both
balances and building choices, while still enforcing rules on-chain. The result is a fairer strategic environment where
players reveal only what they choose to decrypt.

## Advantages

- On-chain privacy without off-chain databases or trusted servers.
- Encrypted balances and tiles prevent strategy leakage and balance spying.
- Deterministic game rules enforced by a smart contract, not by a UI.
- Simple grid mechanics that are easy to expand while keeping privacy guarantees.
- User-driven decryption for balances, tiles, and status feedback.

## Gameplay Summary

- Join once to mint 10,000 encrypted gold.
- Choose a building type (1-4) and place it on a 3x3 grid.
- Building costs:
  - Type 1: 100 gold
  - Type 2: 200 gold
  - Type 3: 400 gold
  - Type 4: 1000 gold
- Each placement is validated on-chain:
  - Invalid building type
  - Tile already taken
  - Not enough gold
- Players can decrypt their own balance and tiles on demand.

## How Privacy Works

The game uses Zama FHEVM to operate on encrypted values directly on-chain. The contract never sees plaintext balances
or building types. The UI encrypts player inputs, submits ciphertexts on-chain, and later decrypts the encrypted state
using the Zama relayer SDK and a user signature.

## Tech Stack

- Smart contracts: Solidity + Zama FHEVM (`@fhevm/solidity`)
- Contract framework: Hardhat + hardhat-deploy
- Frontend: React + Vite + TypeScript
- Wallet and reads: wagmi + viem
- Writes: ethers v6
- UI wallet connection: RainbowKit
- Encryption relayer: `@zama-fhe/relayer-sdk`

## Repository Layout

- `contracts/` smart contracts
- `deploy/` deployment scripts
- `tasks/` custom Hardhat tasks for gameplay and decryption
- `test/` contract tests
- `src/` frontend application (Vite)
- `docs/` FHEVM and relayer docs
- `deployments/` deployment artifacts per network

## Smart Contract Design

Main contract: `contracts/ConfidentialGame.sol`

State:

- `_balances[address]` encrypted `euint64` gold
- `_buildings[address][position]` encrypted `euint8` building type
- `_lastPlacementStatus[address]` encrypted `euint8` status
- `_hasJoined[address]` join tracking

Constants:

- `GRID_WIDTH = 3`, `GRID_SIZE = 9`
- `STARTING_GOLD = 10,000`

Core functions:

- `joinGame()` mints encrypted gold and initializes the grid
- `placeBuilding(position, buildingType, inputProof)` validates and places encrypted buildings
- `getBalance(player)`, `getBuilding(player, position)`, `getBoard(player)`, `getLastPlacementStatus(player)`,
  `hasJoined(player)` expose encrypted state

Placement status codes (encrypted in storage):

- `0` success
- `1` invalid building type
- `2` tile occupied
- `3` insufficient funds

## Frontend Flow

The UI is in `src/` and uses no environment variables, no local storage, and no localhost network.

Main flow:

1. Connect wallet.
2. Join game (write via ethers).
3. Read encrypted state (wagmi + viem).
4. Encrypt building input with the Zama relayer SDK.
5. Place building (write via ethers).
6. Decrypt balance, status, and tiles on demand using user signatures.

Important configuration:

- Set `CONTRACT_ADDRESS` in `src/src/config/contracts.ts`.
- Copy the ABI from the deployment artifact in `deployments/sepolia` into `src/src/config/contracts.ts`.

## Setup and Requirements

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
cd src
npm install
```

## Hardhat Configuration

This project uses `.env` for deployment configuration (Hardhat only):

```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional
REPORT_GAS=optional
```

Notes:

- Deployments use a private key. Do not use a mnemonic.
- Sepolia uses Infura with `INFURA_API_KEY`.

## Build, Test, and Local Deployment

Compile and test:

```bash
npm run compile
npm run test
```

Start a local node:

```bash
npx hardhat node
```

Deploy to the local node:

```bash
npx hardhat deploy --network anvil
```

Run local tasks (examples):

```bash
npx hardhat task:join-game --network anvil
npx hardhat task:place-building --network anvil --position 0 --building 2
npx hardhat task:decrypt-balance --network anvil
npx hardhat task:decrypt-tile --network anvil --position 0
```

## Sepolia Deployment

Deploy:

```bash
npx hardhat deploy --network sepolia
```

After deployment:

- Copy the Sepolia deployment ABI into `src/src/config/contracts.ts`.
- Update `CONTRACT_ADDRESS` in `src/src/config/contracts.ts`.
- Run the frontend with Vite.

## Frontend Dev Server

From `src/`:

```bash
npm run dev
```

The UI targets Sepolia only. Do not point the frontend to a localhost network.

## Testing Strategy

- Unit tests cover join and placement behavior.
- Hardhat tasks validate encrypted reads and user decryption flows.
- Manual UI testing confirms wallet connection, encrypted writes, and user-driven decryption.

## Limitations

- FHE operations are more expensive than plaintext logic.
- Encrypted state requires user decryption, so reads are not immediately human-readable.
- Current gameplay is intentionally minimal to keep the privacy pipeline clear.

## Future Plans

- Larger maps and configurable grid sizes.
- Additional building types with encrypted upgrades.
- Encrypted resource production over time.
- Multiplayer interactions with confidential trading or alliances.
- Better UX for decrypting multiple tiles in batches.
- Optional on-chain events for aggregate, privacy-preserving analytics.

## License

BSD-3-Clause-Clear. See `LICENSE`.
