const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  const client = signers[0];
  const freelancer = signers[3]; // Account 3
  const MilestonePay = await hre.ethers.getContractFactory("MilestonePay");
  const contractConfig = require("../frontend/src/contract-address.json");
  const contractAddress = contractConfig.address;
  const contract = MilestonePay.attach(contractAddress);

  console.log("\n=================== Creating Test Project ===================");
  console.log("Client Address:", client.address);
  console.log("Freelancer Address:", freelancer.address);
  console.log("Sending transaction...");

  try {
    const tx = await contract.connect(client).createProject(
      freelancer.address,
      3,
      ["Test Milestone 1", "Test Milestone 2", "Test Milestone 3"],
      [30, 40, 30],
      { value: hre.ethers.parseEther("5") }
    );
    await tx.wait();
    console.log("✅ Project created successfully! Tx Hash:", tx.hash);

    const nextId = await contract.nextProjectId();
    console.log("Contract nextProjectId:", nextId.toString());

    const p = await contract.getProject(0);
    console.log("Project #0 Details:", {
      client: p.client,
      freelancer: p.freelancer,
      totalAmount: hre.ethers.formatEther(p.totalAmount),
      milestoneCount: p.milestoneCount.toString(),
      state: p.state.toString()
    });
    console.log("=============================================================\n");
  } catch (e) {
    console.error("❌ Failed to create project on-chain:", e);
  }
}

main().catch(console.error);
