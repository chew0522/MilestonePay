const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MilestonePay", function () {
  let milestonePay;
  let client, freelancer, admin1, admin2, admin3, other;

  beforeEach(async function () {
    [client, freelancer, admin1, admin2, admin3, other] = await ethers.getSigners();
    const MilestonePay = await ethers.getContractFactory("MilestonePay");
    milestonePay = await MilestonePay.deploy(admin1.address, admin2.address, admin3.address);
    await milestonePay.waitForDeployment();
  });

  describe("Project Creation", function () {
    it("should create a project with milestones", async function () {
      const descriptions = ["Design", "Development", "Testing"];
      const percentages = [30, 50, 20];
      const totalAmount = ethers.parseEther("10");

      const tx = await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 3, descriptions, percentages,
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
          freelancer.address, "Test Project Title", "Test Project Description", 2, descriptions, percentages,
          { value: ethers.parseEther("10") }
        )
      ).to.be.revertedWith("Percentages must sum to 100");
    });

    it("should reject with zero deposit", async function () {
      const descriptions = ["Design"];
      const percentages = [100];

      await expect(
        milestonePay.connect(client).createProject(
          freelancer.address, "Test Project Title", "Test Project Description", 1, descriptions, percentages,
          { value: 0 }
        )
      ).to.be.revertedWith("Must deposit funds");
    });

    it("should store and return project title and description", async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, "My Web Project", "Create a responsive React app", 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );
      const p = await milestonePay.getProject(0);
      expect(p.title).to.equal("My Web Project");
      expect(p.description).to.equal("Create a responsive React app");
    });
  });

  describe("Milestone Flow", function () {
    let projectId = 0;

    beforeEach(async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );
    });

    it("should allow freelancer to complete a milestone", async function () {
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      const milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isCompleted).to.be.true;
    });

    it("should release payment on milestone approval (less 3% fee)", async function () {
      await milestonePay.connect(freelancer).completeMilestone(0, 0);

      await expect(
        milestonePay.connect(client).approveMilestone(0, 0)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("4.85"));
    });

    it("should reject if non-freelancer tries to complete", async function () {
      await expect(
        milestonePay.connect(other).completeMilestone(0, 0)
      ).to.be.revertedWith("Not the freelancer");
    });

    it("should allow client to reject a milestone with a reason", async function () {
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      await milestonePay.connect(client).rejectMilestone(0, 0, "Needs more design iterations");

      const milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isCompleted).to.be.false;
      expect(milestone.rejectionReason).to.equal("Needs more design iterations");
    });
  });

  describe("Dispute Resolution", function () {
    beforeEach(async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );
      // Freelancer marks milestone as completed, and Client rejects it so freelancer can raise dispute
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      await milestonePay.connect(client).rejectMilestone(0, 0, "Rejected Work");
    });

    it("should allow participants to raise a dispute", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0, 0);
      const milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isDisputed).to.be.true;
    });

    it("should let arbitrators vote and resolve in freelancer's favor (less 3% fee) only after all 3 vote", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0, 0);

      // First vote from admin1 does not resolve
      await milestonePay.connect(admin1).resolveDispute(0, 0, true);

      // Second vote from admin2 does not resolve
      await milestonePay.connect(admin2).resolveDispute(0, 0, true);

      // Verify milestone is still disputed, and project is still Active
      let milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isDisputed).to.be.true;
      let project = await milestonePay.getProject(0);
      expect(project.state).to.equal(0); // Active

      // Third vote from admin3 resolves the dispute (2-1 majority for freelancer)
      await expect(
        milestonePay.connect(admin3).resolveDispute(0, 0, false)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("4.85"));

      project = await milestonePay.getProject(0);
      expect(project.state).to.equal(2); // Completed
    });

    it("should let arbitrators vote and resolve with refund to client, reset the milestone, and require re-funding on client approval", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0, 0);

      // First vote from admin1 does not resolve
      await milestonePay.connect(admin1).resolveDispute(0, 0, false);

      // Second vote from admin2 does not resolve
      await milestonePay.connect(admin2).resolveDispute(0, 0, false);

      // Verify milestone is still disputed, and project is still Active
      let milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isDisputed).to.be.true;
      let project = await milestonePay.getProject(0);
      expect(project.state).to.equal(0); // Active

      // Third vote from admin3 resolves the dispute (2-1 majority for client)
      await expect(
        milestonePay.connect(admin3).resolveDispute(0, 0, true)
      ).to.changeEtherBalance(client, ethers.parseEther("5"));

      // Project state remains Active (0), escrow balance is 0
      project = await milestonePay.getProject(0);
      expect(project.state).to.equal(0);
      expect(project.escrowBalance).to.equal(0);

      // Milestone is reset (isCompleted = false, isApproved = false, isDisputed = false)
      milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isCompleted).to.be.false;
      expect(milestone.isApproved).to.be.false;
      expect(milestone.isDisputed).to.be.false;

      // Freelancer completes the milestone again
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      milestone = await milestonePay.milestones(0, 0);
      expect(milestone.isCompleted).to.be.true;

      // Client attempts to approve without sending value -> should revert
      await expect(
        milestonePay.connect(client).approveMilestone(0, 0)
      ).to.be.revertedWith("Must deposit milestone funds to approve");

      // Client approves by sending 5 ETH -> succeeds, freelancer gets paid (less 3% fee)
      await expect(
        milestonePay.connect(client).approveMilestone(0, 0, { value: ethers.parseEther("5") })
      ).to.changeEtherBalance(freelancer, ethers.parseEther("4.85"));

      // Project is now completed since all milestones are approved
      project = await milestonePay.getProject(0);
      expect(project.state).to.equal(2); // Completed
    });

    it("should prevent double voting by the same arbitrator", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0, 0);

      await milestonePay.connect(admin1).resolveDispute(0, 0, true);
      await expect(
        milestonePay.connect(admin1).resolveDispute(0, 0, true)
      ).to.be.revertedWith("Already voted on this dispute");
    });

    it("should reject dispute resolution from non-arbitrators", async function () {
      await milestonePay.connect(freelancer).raiseDispute(0, 0);

      await expect(
        milestonePay.connect(client).resolveDispute(0, 0, true)
      ).to.be.reverted;
    });
  });

  describe("Cancellation", function () {
    it("should allow client to cancel before any milestone approved", async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );

      await expect(
        milestonePay.connect(client).cancelProject(0)
      ).to.changeEtherBalance(client, ethers.parseEther("5"));
    });
  });

  describe("Marketplace & Claiming", function () {
    let openProjectId = 0; // The freshly deployed project has ID 0

    beforeEach(async function () {
      const descriptions = ["Design", "Dev"];
      const percentages = [40, 60];
      
      // Deploy project with Zero Address (open gig)
      const tx = await milestonePay.connect(client).createProject(
        ethers.ZeroAddress, "Test Project Title", "Test Project Description", 2, descriptions, percentages,
        { value: ethers.parseEther("10") }
      );
      await tx.wait();
    });

    it("should allow a freelancer to claim an open project", async function () {
      await expect(
        milestonePay.connect(freelancer).claimProject(openProjectId)
      ).to.emit(milestonePay, "ProjectClaimed").withArgs(openProjectId, freelancer.address);

      const project = await milestonePay.getProject(openProjectId);
      expect(project.freelancer).to.equal(freelancer.address);
    });

    it("should prevent the client from claiming their own project", async function () {
      await expect(
        milestonePay.connect(client).claimProject(openProjectId)
      ).to.be.revertedWith("Client cannot be the freelancer");
    });

    it("should prevent double claiming", async function () {
      await milestonePay.connect(freelancer).claimProject(openProjectId);
      await expect(
        milestonePay.connect(other).claimProject(openProjectId)
      ).to.be.revertedWith("Project already claimed");
    });
  });

  describe("Platform Fees & Withdrawals", function () {
    beforeEach(async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 1, descriptions, percentages,
        { value: ethers.parseEther("10") }
      );
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
    });

    it("should automatically distribute 3% platform fee on milestone approval if it completes the project", async function () {
      // 10 ETH * 3% = 0.3 ETH fee. Freelancer gets 9.7 ETH.
      // Arbitrators split the 0.3 ETH fee (0.1 ETH each) automatically.
      await expect(
        milestonePay.connect(client).approveMilestone(0, 0)
      ).to.changeEtherBalances(
        [freelancer, admin1, admin2, admin3],
        [ethers.parseEther("9.7"), ethers.parseEther("0.1"), ethers.parseEther("0.1"), ethers.parseEther("0.1")]
      );

      expect(await milestonePay.accumulatedFees()).to.equal(0);
    });

    it("should accumulate fees in projectArbitratorFees and not distribute them until project completion", async function () {
      const descriptions = ["Phase 1", "Phase 2"];
      const percentages = [50, 50];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 2, descriptions, percentages,
        { value: ethers.parseEther("10") }
      );
      
      await milestonePay.connect(freelancer).completeMilestone(1, 0);
      
      await expect(
        milestonePay.connect(client).approveMilestone(1, 0)
      ).to.changeEtherBalances(
        [freelancer, admin1, admin2, admin3],
        [ethers.parseEther("4.85"), 0, 0, 0]
      );

      expect(await milestonePay.projectArbitratorFees(1)).to.equal(ethers.parseEther("0.15"));
      expect(await milestonePay.accumulatedFees()).to.equal(0);

      await milestonePay.connect(freelancer).completeMilestone(1, 1);

      await expect(
        milestonePay.connect(client).approveMilestone(1, 1)
      ).to.changeEtherBalances(
        [freelancer, admin1, admin2, admin3],
        [ethers.parseEther("4.85"), ethers.parseEther("0.1"), ethers.parseEther("0.1"), ethers.parseEther("0.1")]
      );

      expect(await milestonePay.projectArbitratorFees(1)).to.equal(0);
      expect(await milestonePay.accumulatedFees()).to.equal(0);
    });

    it("should allow withdrawing fallback accumulatedFees", async function () {
      // Direct transfer of remaining dust is tested under custom audit cases, but we can verify withdrawFees fails on 0 fees.
      await expect(
        milestonePay.connect(admin1).withdrawFees()
      ).to.be.revertedWith("No fees to withdraw");
    });
  });

  describe("Technical Audit & Review", function () {
    beforeEach(async function () {
      const descriptions = ["Design", "Development"];
      const percentages = [50, 50];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 2, descriptions, percentages,
        { value: ethers.parseEther("10") }
      );
      // Dispute must be raised to trigger review
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      await milestonePay.connect(client).rejectMilestone(0, 0, "Rejected Audit Review");
      await milestonePay.connect(freelancer).raiseDispute(0, 0);

      // Grant TECHNICAL_STAFF_ROLE to admin1 for testing
      const techRole = await milestonePay.TECHNICAL_STAFF_ROLE();
      await milestonePay.connect(client).grantRole(techRole, admin1.address);
    });

    it("should allow a project participant to request a technical review", async function () {
      await expect(
        milestonePay.connect(client).requestTechnicalReview(0, 0)
      ).to.emit(milestonePay, "TechnicalReviewRequested").withArgs(0, 0, client.address);

      expect(await milestonePay.reviewRequested(0, 0)).to.be.true;
    });

    it("should prevent non-participants from requesting a technical review", async function () {
      await expect(
        milestonePay.connect(other).requestTechnicalReview(0, 0)
      ).to.be.revertedWith("Not a participant");
    });

    it("should allow technical staff to submit an audit report", async function () {
      await milestonePay.connect(client).requestTechnicalReview(0, 0);

      // admin1 has TECHNICAL_STAFF_ROLE by default in constructor
      await expect(
        milestonePay.connect(admin1).submitAuditReport(0, 0, "Code quality is excellent, database models are solid", true)
      ).to.emit(milestonePay, "TechnicalReviewSubmitted").withArgs(
        0, 0, admin1.address, true, "Code quality is excellent, database models are solid"
      );

      const review = await milestonePay.milestoneReviews(0, 0);
      expect(review.staff).to.equal(admin1.address);
      expect(review.report).to.equal("Code quality is excellent, database models are solid");
      expect(review.recommendedPass).to.be.true;
      expect(review.isSubmitted).to.be.true;
    });

    it("should prevent non-technical staff from submitting audit reports", async function () {
      await milestonePay.connect(client).requestTechnicalReview(0, 0);

      await expect(
        milestonePay.connect(other).submitAuditReport(0, 0, "Looks good", true)
      ).to.be.reverted;
    });

    it("should prevent submitting audit reports if review was not requested", async function () {
      await expect(
        milestonePay.connect(admin1).submitAuditReport(0, 0, "Looks good", true)
      ).to.be.revertedWith("Review not requested");
    });

    it("should pay 0.25% fee to auditor and 2.75% to platform on milestone approval if audited (intermediate milestone)", async function () {
      await milestonePay.connect(client).requestTechnicalReview(0, 0);
      await milestonePay.connect(admin1).submitAuditReport(0, 0, "Approved", true);

      // Milestone value is 5 ETH.
      // 3% Platform Fee = 0.15 ETH.
      // Auditor Fee = 0.25% of 5 ETH = 0.0125 ETH.
      // Net to freelancer = 4.85 ETH (5 - 0.15).
      // Net platform fee added = 0.15 - 0.0125 = 0.1375 ETH.
      
      await expect(
        milestonePay.connect(client).approveMilestone(0, 0)
      ).to.changeEtherBalances(
        [freelancer, admin1],
        [ethers.parseEther("4.85"), ethers.parseEther("0.0125")]
      );

      expect(await milestonePay.projectArbitratorFees(0)).to.equal(ethers.parseEther("0.1375"));
      expect(await milestonePay.accumulatedFees()).to.equal(0);
    });

    it("should pay 0.25% fee to auditor and 2.75% to platform on dispute resolved in favor of freelancer (intermediate milestone)", async function () {
      await milestonePay.connect(client).requestTechnicalReview(0, 0);
      await milestonePay.connect(admin1).submitAuditReport(0, 0, "Approved", true);

      await milestonePay.connect(admin1).resolveDispute(0, 0, true); // vote 1 (freelancer)
      await milestonePay.connect(admin2).resolveDispute(0, 0, true); // vote 2 (freelancer)

      await expect(
        milestonePay.connect(admin3).resolveDispute(0, 0, true) // vote 3 (freelancer)
      ).to.changeEtherBalances(
        [freelancer, admin1],
        [ethers.parseEther("4.85"), ethers.parseEther("0.0125")]
      );

      expect(await milestonePay.projectArbitratorFees(0)).to.equal(ethers.parseEther("0.1375"));
      expect(await milestonePay.accumulatedFees()).to.equal(0);
    });

    it("should pay 0.25% fee to auditor from platform general fees on dispute resolved in favor of client refund (zero project fees)", async function () {
      await milestonePay.connect(client).requestTechnicalReview(0, 0);
      await milestonePay.connect(admin1).submitAuditReport(0, 0, "Failed", false);

      await milestonePay.connect(admin1).resolveDispute(0, 0, false); // vote 1 (client)
      await milestonePay.connect(admin2).resolveDispute(0, 0, false); // vote 2 (client)

      await expect(
        milestonePay.connect(admin3).resolveDispute(0, 0, false) // vote 3 (client)
      ).to.changeEtherBalances(
        [client, admin1],
        [ethers.parseEther("5"), ethers.parseEther("0.0125")]
      );

      expect(await milestonePay.projectArbitratorFees(0)).to.equal(0);
      expect(await milestonePay.accumulatedFees()).to.equal(0);
    });

    it("should deduct auditor fee from projectArbitratorFees on refund if project has accumulated fees and distribute remaining fees to arbitrators on project completion", async function () {
      const descriptions = ["Phase 1", "Phase 2"];
      const percentages = [50, 50];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 2, descriptions, percentages,
        { value: ethers.parseEther("10") }
      );

      // Milestone 0 approved normally (no audit) -> Platform Fee (3% of 5 ETH) = 0.15 ETH added to projectArbitratorFees[1].
      await milestonePay.connect(freelancer).completeMilestone(1, 0);
      await milestonePay.connect(client).approveMilestone(1, 0);
      expect(await milestonePay.projectArbitratorFees(1)).to.equal(ethers.parseEther("0.15"));

      // Milestone 1 completed, dispute raised, audited.
      await milestonePay.connect(freelancer).completeMilestone(1, 1);
      await milestonePay.connect(client).rejectMilestone(1, 1, "Rejected 1-1");
      await milestonePay.connect(freelancer).raiseDispute(1, 1);
      await milestonePay.connect(client).requestTechnicalReview(1, 1);
      await milestonePay.connect(admin1).submitAuditReport(1, 1, "Failed", false);

      await milestonePay.connect(admin1).resolveDispute(1, 1, false);
      await milestonePay.connect(admin2).resolveDispute(1, 1, false);

      // Resolving client refund:
      // Client gets 5 ETH refund.
      // Auditor gets 0.0125 ETH from projectArbitratorFees[1].
      // Project is NOT completed (Milestone 1 is reset to incomplete), so arbitrators get 0 ETH.
      await expect(
        milestonePay.connect(admin3).resolveDispute(1, 1, false)
      ).to.changeEtherBalances(
        [client, admin1, admin2, admin3],
        [
          ethers.parseEther("5"),
          ethers.parseEther("0.0125"), // Auditor fee only
          0,
          0
        ]
      );

      // Project arbitrator fees pool decreased from 0.15 to 0.1375 ETH
      expect(await milestonePay.projectArbitratorFees(1)).to.equal(ethers.parseEther("0.1375"));
      expect(await milestonePay.accumulatedFees()).to.equal(0);

      // Now Freelancer completes Milestone 1 again
      await milestonePay.connect(freelancer).completeMilestone(1, 1);

      // Client approves Milestone 1 by depositing 5 ETH
      // Milestone 1 approved -> adds 0.15 ETH to projectArbitratorFees[1] (no audit this time).
      // Total project arbitrator fees = 0.1375 + 0.15 = 0.2875 ETH.
      // Project completes -> splits 0.2875 ETH among the 3 arbitrators (0.095833333333333333 ETH each).
      // Remainder dust (1 wei) goes to accumulatedFees.
      await expect(
        milestonePay.connect(client).approveMilestone(1, 1, { value: ethers.parseEther("5") })
      ).to.changeEtherBalances(
        [freelancer, admin1, admin2, admin3],
        [
          ethers.parseEther("4.85"), // Freelancer net payment
          ethers.parseEther("0.095833333333333333"), // admin1 arbitrator share
          ethers.parseEther("0.095833333333333333"), // admin2 arbitrator share
          ethers.parseEther("0.095833333333333333")  // admin3 arbitrator share
        ]
      );

      expect(await milestonePay.projectArbitratorFees(1)).to.equal(0);
      expect(await milestonePay.accumulatedFees()).to.equal(1); // 1 wei dust
    });

    it("should limit disputes to at most 1 from client and 1 from freelancer per milestone", async function () {
      // Milestone 0 (dispute raised by freelancer in beforeEach)
      // Resolve it as refund to client (vote to refund)
      await milestonePay.connect(admin1).resolveDispute(0, 0, false);
      await milestonePay.connect(admin2).resolveDispute(0, 0, false);
      await milestonePay.connect(admin3).resolveDispute(0, 0, false); // Resolved! Milestone reset.

      // 1. Try to dispute by freelancer again -> should revert
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      await milestonePay.connect(client).rejectMilestone(0, 0, "Rejected resubmission");
      await expect(
        milestonePay.connect(freelancer).raiseDispute(0, 0)
      ).to.be.revertedWith("Freelancer already disputed this milestone");

      // For client to dispute, it must be completed. Since it is currently rejected (isCompleted = false),
      // freelancer completes it again.
      await milestonePay.connect(freelancer).completeMilestone(0, 0);

      // 2. Client raises a dispute (first time for client) -> should succeed
      await milestonePay.connect(client).raiseDispute(0, 0);
      expect(await milestonePay.clientDisputed(0, 0)).to.be.true;

      // Resolve it as refund to client again (so we can test client double disputing)
      await milestonePay.connect(admin1).resolveDispute(0, 0, false);
      await milestonePay.connect(admin2).resolveDispute(0, 0, false);
      await milestonePay.connect(admin3).resolveDispute(0, 0, false); // Resolved!

      // 3. Try to dispute by client again -> should revert
      await milestonePay.connect(freelancer).completeMilestone(0, 0);
      await expect(
        milestonePay.connect(client).raiseDispute(0, 0)
      ).to.be.revertedWith("Client already disputed this milestone");
    });

    it("should prevent freelancer from raising a dispute during waiting (before rejection), but allow it after rejection", async function () {
      const descriptions = ["Design"];
      const percentages = [100];
      await milestonePay.connect(client).createProject(
        freelancer.address, "Test Project Title", "Test Project Description", 1, descriptions, percentages,
        { value: ethers.parseEther("5") }
      );
      
      // Freelancer completes milestone
      await milestonePay.connect(freelancer).completeMilestone(1, 0);

      // Freelancer tries to raise dispute during waiting -> should revert
      await expect(
        milestonePay.connect(freelancer).raiseDispute(1, 0)
      ).to.be.revertedWith("Milestone must be rejected first");

      // Client rejects the milestone
      await milestonePay.connect(client).rejectMilestone(1, 0, "Work is incorrect");

      // Freelancer tries to raise dispute after rejection -> should succeed
      await milestonePay.connect(freelancer).raiseDispute(1, 0);
      const milestone = await milestonePay.milestones(1, 0);
      expect(milestone.isDisputed).to.be.true;
    });
  });
});
