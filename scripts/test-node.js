const hre = require("hardhat");

async function main() {
  const provider = hre.ethers.provider;
  const blockNum = await provider.getBlockNumber();
  console.log("Current Block Number:", blockNum);

  const signers = await hre.ethers.getSigners();
  console.log("Deployer Address:", signers[0].address);
  const balance = await provider.getBalance(signers[0].address);
  console.log("Deployer Balance:", hre.ethers.formatEther(balance), "ETH");

  const contractConfig = require("../frontend/src/contract-address.json");
  const contractAddress = contractConfig.address;
  const code = await provider.getCode(contractAddress);
  console.log("Code at contractAddress:", code === "0x" ? "0x (NO CODE)" : `${code.slice(0, 100)}... (${code.length} chars)`);

  const oldAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  const oldCode = await provider.getCode(oldAddress);
  console.log("Code at oldAddress:", oldCode === "0x" ? "0x (NO CODE)" : `${oldCode.slice(0, 100)}... (${oldCode.length} chars)`);
}

main().catch(console.error);
