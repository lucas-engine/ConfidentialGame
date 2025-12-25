import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedGame = await deploy("ConfidentialGame", {
    from: deployer,
    log: true,
  });

  console.log(`ConfidentialGame contract: `, deployedGame.address);
};
export default func;
func.id = "deploy_confidentialGame"; // id required to prevent reexecution
func.tags = ["ConfidentialGame"];
