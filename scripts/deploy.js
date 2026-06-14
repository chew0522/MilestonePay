const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const MilestonePay = await hre.ethers.getContractFactory("MilestonePay");
  const contract = await MilestonePay.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\n✅ MilestonePay deployed to:", contractAddress);
  console.log("Owner (deployer):", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
