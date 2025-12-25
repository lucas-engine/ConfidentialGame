import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:game-address", "Prints the ConfidentialGame address").setAction(async function (_taskArguments, hre) {
  const { deployments } = hre;
  const deployment = await deployments.get("ConfidentialGame");
  console.log("ConfidentialGame address is " + deployment.address);
});

task("task:join-game", "Joins the game and mints encrypted gold")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const [signer] = await ethers.getSigners();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("ConfidentialGame");
    const game = await ethers.getContractAt("ConfidentialGame", deployment.address);

    const tx = await game.connect(signer).joinGame();
    console.log(`Joining game... tx=${tx.hash}`);
    await tx.wait();
    console.log(`Joined game as ${signer.address}`);
  });

task("task:decrypt-balance", "Decrypts the caller balance")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const [signer] = await ethers.getSigners();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("ConfidentialGame");
    const game = await ethers.getContractAt("ConfidentialGame", deployment.address);

    const encryptedBalance = await game.getBalance(signer.address);
    const decrypted = await fhevm.userDecryptEuint(FhevmType.euint64, encryptedBalance, deployment.address, signer);
    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Decrypted balance: ${decrypted}`);
  });

task("task:place-building", "Places an encrypted building on the grid")
  .addParam("position", "Tile position 0-8")
  .addParam("building", "Building type 1-4")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const [signer] = await ethers.getSigners();

    const position = parseInt(taskArguments.position);
    const building = parseInt(taskArguments.building);

    if (Number.isNaN(position) || position < 0 || position > 8) {
      throw new Error("position must be between 0 and 8");
    }
    if (![1, 2, 3, 4].includes(building)) {
      throw new Error("building must be 1, 2, 3, or 4");
    }

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("ConfidentialGame");
    const game = await ethers.getContractAt("ConfidentialGame", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add8(building)
      .encrypt();

    const tx = await game.connect(signer).placeBuilding(position, encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Placing building... tx=${tx.hash}`);
    await tx.wait();
    console.log(`Placed building ${building} at position ${position}`);
  });

task("task:decrypt-tile", "Decrypts the building type on a given tile")
  .addParam("position", "Tile position 0-8")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const [signer] = await ethers.getSigners();

    const position = parseInt(taskArguments.position);
    if (Number.isNaN(position) || position < 0 || position > 8) {
      throw new Error("position must be between 0 and 8");
    }

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("ConfidentialGame");
    const game = await ethers.getContractAt("ConfidentialGame", deployment.address);

    const encryptedTile = await game.getBuilding(signer.address, position);
    if (encryptedTile === ethers.ZeroHash) {
      console.log("Tile has no encrypted value yet.");
      return;
    }

    const decrypted = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedTile, deployment.address, signer);
    console.log(`Encrypted tile: ${encryptedTile}`);
    console.log(`Decrypted value: ${decrypted}`);
  });
