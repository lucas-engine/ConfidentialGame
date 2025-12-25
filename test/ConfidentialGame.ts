import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ConfidentialGame, ConfidentialGame__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ConfidentialGame")) as ConfidentialGame__factory;
  const game = (await factory.deploy()) as ConfidentialGame;
  const gameAddress = await game.getAddress();

  return { game, gameAddress };
}

describe("ConfidentialGame", () => {
  let signers: Signers;
  let game: ConfidentialGame;
  let gameAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    ({ game, gameAddress } = await deployFixture());
  });

  it("allows a player to join with encrypted starting gold and empty grid", async () => {
    await game.connect(signers.alice).joinGame();

    const encryptedBalance = await game.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      gameAddress,
      signers.alice,
    );
    expect(clearBalance).to.equal(10_000n);

    const encryptedBoard = await game.getBoard(signers.alice.address);
    for (const tile of encryptedBoard) {
      const clearTile = await fhevm.userDecryptEuint(FhevmType.euint8, tile, gameAddress, signers.alice);
      expect(clearTile).to.equal(0n);
    }
  });

  it("stores encrypted building choice and deducts encrypted cost", async () => {
    await game.connect(signers.alice).joinGame();

    const encryptedInput = await fhevm
      .createEncryptedInput(gameAddress, signers.alice.address)
      .add8(2)
      .encrypt();

    await game
      .connect(signers.alice)
      .placeBuilding(4, encryptedInput.handles[0], encryptedInput.inputProof);

    const encryptedTile = await game.getBuilding(signers.alice.address, 4);
    const clearTile = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedTile, gameAddress, signers.alice);
    expect(clearTile).to.equal(2n);

    const encryptedBalance = await game.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      gameAddress,
      signers.alice,
    );
    expect(clearBalance).to.equal(10_000n - 200n);

    const status = await game.getLastPlacementStatus(signers.alice.address);
    const clearStatus = await fhevm.userDecryptEuint(FhevmType.euint8, status, gameAddress, signers.alice);
    expect(clearStatus).to.equal(0n);
  });

  it("keeps balance when building type is invalid", async () => {
    await game.connect(signers.alice).joinGame();

    const encryptedInput = await fhevm
      .createEncryptedInput(gameAddress, signers.alice.address)
      .add8(5)
      .encrypt();

    await game
      .connect(signers.alice)
      .placeBuilding(0, encryptedInput.handles[0], encryptedInput.inputProof);

    const encryptedTile = await game.getBuilding(signers.alice.address, 0);
    const clearTile = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedTile, gameAddress, signers.alice);
    expect(clearTile).to.equal(0n);

    const encryptedBalance = await game.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      gameAddress,
      signers.alice,
    );
    expect(clearBalance).to.equal(10_000n);

    const status = await game.getLastPlacementStatus(signers.alice.address);
    const clearStatus = await fhevm.userDecryptEuint(FhevmType.euint8, status, gameAddress, signers.alice);
    expect(clearStatus).to.equal(1n);
  });

  it("prevents overwriting a tile and leaves balance unchanged", async () => {
    await game.connect(signers.alice).joinGame();

    const firstInput = await fhevm
      .createEncryptedInput(gameAddress, signers.alice.address)
      .add8(1)
      .encrypt();
    await game
      .connect(signers.alice)
      .placeBuilding(0, firstInput.handles[0], firstInput.inputProof);

    const secondInput = await fhevm
      .createEncryptedInput(gameAddress, signers.alice.address)
      .add8(3)
      .encrypt();
    await game
      .connect(signers.alice)
      .placeBuilding(0, secondInput.handles[0], secondInput.inputProof);

    const encryptedTile = await game.getBuilding(signers.alice.address, 0);
    const clearTile = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedTile, gameAddress, signers.alice);
    expect(clearTile).to.equal(1n);

    const encryptedBalance = await game.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      gameAddress,
      signers.alice,
    );
    expect(clearBalance).to.equal(10_000n - 100n);

    const status = await game.getLastPlacementStatus(signers.alice.address);
    const clearStatus = await fhevm.userDecryptEuint(FhevmType.euint8, status, gameAddress, signers.alice);
    expect(clearStatus).to.equal(2n);
  });
});
