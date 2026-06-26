const hre = require("hardhat");

async function main() {
  const MilestonePay = await hre.ethers.getContractFactory("MilestonePay");
  const contractConfig = require("../frontend/src/contract-address.json");
  const contractAddress = contractConfig.address;
  const contract = MilestonePay.attach(contractAddress);

  try {
    const nextId = await contract.nextProjectId();
    console.log("\n=================== blockchain contract state ===================");
    console.log("Contract Address:", contractAddress);
    console.log("Contract nextProjectId:", nextId.toString());
    
    for (let i = 0; i < Number(nextId); i++) {
      const p = await contract.getProject(i);
      console.log(`Project #${i}:`, {
        client: p.client,
        freelancer: p.freelancer,
        totalAmount: hre.ethers.formatEther(p.totalAmount),
        milestoneCount: p.milestoneCount.toString(),
        completedMilestones: p.completedMilestones.toString(),
        state: p.state.toString(),
        escrowBalance: hre.ethers.formatEther(p.escrowBalance)
      });
    }
    console.log("=================================================================\n");
  } catch (e) {
    console.error("Error reading contract:", e);
  }
}

main().catch(console.error);
