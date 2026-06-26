const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const MilestonePay = await hre.ethers.getContractFactory("MilestonePay");
  
  // Use Account 0, Account 1, and Account 2 as the three Arbitrators
  const admin1 = signers[0].address;
  const admin2 = signers[1].address;
  const admin3 = signers[2].address;

  console.log("Assigning Arbitrator Roles to:\n  -", admin1, "\n  -", admin2, "\n  -", admin3);

  const contract = await MilestonePay.deploy(admin1, admin2, admin3);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\n✅ MilestonePay deployed to:", contractAddress);
  console.log("Owner (deployer):", deployer.address);

  // Grant TECHNICAL_STAFF_ROLE to Account 19 (signers[19])
  const techStaffRole = await contract.TECHNICAL_STAFF_ROLE();
  const techStaffAddress = signers[19].address;
  console.log("\nGranting TECHNICAL_STAFF_ROLE to Account 19:", techStaffAddress);
  const txGrant = await contract.grantRole(techStaffRole, techStaffAddress);
  await txGrant.wait();
  console.log("✅ TECHNICAL_STAFF_ROLE granted successfully to Account 19!");

  // Write contract address to JSON file for automatic sync
  const addressPath = path.join(__dirname, "../frontend/src/contract-address.json");
  fs.writeFileSync(addressPath, JSON.stringify({ address: contractAddress }, null, 2));
  console.log("✅ Contract address synced to frontend/src/contract-address.json!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
