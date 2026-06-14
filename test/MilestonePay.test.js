const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MilestonePay", function () {
  let milestonePay;
  let client, freelancer, admin, other;

  beforeEach(async function () {
    [client, freelancer, admin, other] = await ethers.getSigners();
    const MilestonePay = await ethers.getContractFactory("MilestonePay");
    milestonePay = await MilestonePay.deploy();
    await milestonePay.waitForDeployment();
  });

  describe("Project Creation", function () {
    it("should create a project with milestones", async function () {
      const descriptions = ["Design", "Development", "Testing"];
      const percentages = [30, 50, 20];
      const totalAmount = ethers.parseEther("10");

      const tx = await milestonePay.connect(client).createProject(
        freelancer.address, 3, descriptions, percentages,
        { value: totalAmount }
      );
      await tx.wait();

      const project = await milestonePay.getProject(0);
      expect(project.client).to.equal(client.address);
      expect(project.freelancer).to.equal(freelancer.address);
      expect(project.totalAmount).to.equal(totalAmount);
      expect(project.milestoneCount).to.equal(3);
      expect(project.state).to.equal(0); // Active
    });

    it("should reject if percentages don't sum to 100", async function () {
      const descriptions = ["Design", "Dev"];
      const percentages = [30, 30];

      await expect(
        milestonePay.connect(client).createProject(
          freelancer.address, 2, descriptions, percentages,
          { value: ethers.parseEther("10") }
        )
      ).to.be.revertedWith("Percentages must sum to 100");
    });

    it("should reject with zero deposit", async function () {
      const descriptions = ["Design"];
      const percentages = [100];

      await expect(
        milestonePay.connect(client).createProject(
          freelancer.address, 1, descriptions, percentages,
          { value: 0 }
        )
      ).to.be.revertedWith("Must deposit funds");
    });
  });

  describe("Milestone Flow", function () {
    let projectId = 0;

    beforeEach(async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );
    });

    it("should allow freelancer to complete a milestone", async function () {
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      const milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isCompleted).to.be.true;
    });

    it("should release payment on milestone approval", async function () {
      await milestonePay.connect(freelancer).completeMilestone(0, 0);

      await expect(
        milestonePay.connect(client).approveMilestone(0, 0)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("5"));
    });

    it("should reject if non-freelancer tries to complete", async function () {
      await expect(
        milestonePay.connect(other).completeMilestone(0, 0)
      ).to.be.revertedWith("Not the freelancer");
    });

    it("should allow client to reject a milestone", async function () {
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      await milestonePay.connect(client).rejectMilestone(0, 0);

      const milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isCompleted).to.be.false;
    });
  });

  describe("Dispute Resolution", function () {
    beforeEach(async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );
    });

    it("should allow participants to raise a dispute", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0);
      const project = await milestonePay.getProject(0);
      expect(project.state).to.equal(1); // Disputed
    });

    it("should let owner resolve dispute in freelancer's favor", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0);

      await expect(
        milestonePay.connect(client).resolveDispute(0, true)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("5"));
    });

    it("should let owner resolve dispute with refund to client", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0);

      await expect(
        milestonePay.connect(client).resolveDispute(0, false)
      ).to.changeEtherBalance(client, ethers.parseEther("5"));
    });
  });

  describe("Cancellation", function () {
    it("should allow client to cancel before any milestone approved", async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );

      await expect(
        milestonePay.connect(client).cancelProject(0)
      ).to.changeEtherBalance(client, ethers.parseEther("5"));
    });
  });
});
