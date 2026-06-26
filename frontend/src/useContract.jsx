import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import MilestonePayABI from "./MilestonePayABI.json";
import { useWallet } from "./WalletContext";
import contractConfig from "./contract-address.json";

const CONTRACT_ADDRESS = contractConfig.address;

export function useContract() {
  const { account } = useWallet();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (account && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.getSigner().then((signer) => {
        setContract(new ethers.Contract(CONTRACT_ADDRESS, MilestonePayABI, signer));
      });
    } else {
      setContract(null);
    }
  }, [account]);

  const getUserProjectIds = useCallback(async () => {
    if (!contract || !account) return [];
    try {
      const ids = await contract.getUserProjects(account);
      return ids.map((id) => Number(id));
    } catch (e) {
      console.error("Error fetching projects:", e);
      return [];
    }
  }, [contract, account]);

  const getProject = useCallback(async (id) => {
    if (!contract) return null;
    try {
      const p = await contract.getProject(id);
      return {
        client: p.client,
        freelancer: p.freelancer,
        totalAmount: ethers.formatEther(p.totalAmount),
        milestoneCount: Number(p.milestoneCount),
        completedMilestones: Number(p.completedMilestones),
        state: ["Active", "Disputed", "Completed", "Cancelled"][Number(p.state)],
        escrowBalance: ethers.formatEther(p.escrowBalance),
        title: p.title,
        description: p.description,
      };
    } catch (e) {
      return null;
    }
  }, [contract]);

  const getMilestone = useCallback(async (projectId, milestoneId) => {
    if (!contract) return null;
    try {
      const m = await contract.milestones(projectId, milestoneId);
      return {
        description: m.description,
        amount: ethers.formatEther(m.amount),
        isCompleted: m.isCompleted,
        isApproved: m.isApproved,
        rejectionReason: m.rejectionReason,
        isDisputed: m.isDisputed,
        submissionDetail: m.submissionDetail,
      };
    } catch (e) {
      return null;
    }
  }, [contract]);

  const createProject = useCallback(async (freelancer, title, description, count, descriptions, percentages, valueEth) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.createProject(freelancer, title, description, count, descriptions, percentages, {
        value: ethers.parseEther(valueEth),
      });
      await tx.wait();
      return tx;
    } catch (e) {
      console.error("Create project failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const completeMilestone = useCallback(async (projectId, milestoneId, submissionDetail = "") => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = submissionDetail.trim()
        ? await contract["completeMilestone(uint256,uint256,string)"](projectId, milestoneId, submissionDetail.trim())
        : await contract["completeMilestone(uint256,uint256)"](projectId, milestoneId);
      await tx.wait();
    } catch (e) {
      console.error("Complete milestone failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const approveMilestone = useCallback(async (projectId, milestoneId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const p = await contract.projects(projectId);
      const m = await contract.milestones(projectId, milestoneId);
      const escrowBalance = p.escrowBalance;
      const amount = m.amount;

      const overrides = {};
      if (escrowBalance < amount) {
        overrides.value = amount;
      }

      const tx = await contract.approveMilestone(projectId, milestoneId, overrides);
      await tx.wait();
    } catch (e) {
      console.error("Approve milestone failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const rejectMilestone = useCallback(async (projectId, milestoneId, reason) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.rejectMilestone(projectId, milestoneId, reason);
      await tx.wait();
    } catch (e) {
      console.error("Reject milestone failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const raiseDispute = useCallback(async (projectId, milestoneId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.raiseDispute(projectId, milestoneId);
      await tx.wait();
    } catch (e) {
      console.error("Raise dispute failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const resolveDispute = useCallback(async (projectId, milestoneId, payFreelancer) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.resolveDispute(projectId, milestoneId, payFreelancer);
      await tx.wait();
    } catch (e) {
      console.error("Resolve dispute failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const claimProject = useCallback(async (projectId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.claimProject(projectId);
      await tx.wait();
    } catch (e) {
      console.error("Claim project failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const cancelProject = useCallback(async (projectId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.cancelProject(projectId);
      await tx.wait();
      return tx;
    } catch (e) {
      console.error("Cancel project failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const getAccumulatedFees = useCallback(async () => {
    if (!contract) return "0";
    try {
      const fees = await contract.accumulatedFees();
      return ethers.formatEther(fees);
    } catch (e) {
      console.error("Error fetching accumulated fees:", e);
      return "0";
    }
  }, [contract]);

  const withdrawFees = useCallback(async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.withdrawFees();
      await tx.wait();
      return tx;
    } catch (e) {
      console.error("Withdraw fees failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const requestTechnicalReview = useCallback(async (projectId, milestoneId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.requestTechnicalReview(projectId, milestoneId);
      await tx.wait();
      return tx;
    } catch (e) {
      console.error("Request technical review failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const submitAuditReport = useCallback(async (projectId, milestoneId, report, recommendedPass) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.submitAuditReport(projectId, milestoneId, report, recommendedPass);
      await tx.wait();
      return tx;
    } catch (e) {
      console.error("Submit audit report failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const getTechnicalReview = useCallback(async (projectId, milestoneId) => {
    if (!contract) return null;
    try {
      const review = await contract.milestoneReviews(projectId, milestoneId);
      return {
        staff: review.staff,
        report: review.report,
        recommendedPass: review.recommendedPass,
        isSubmitted: review.isSubmitted,
      };
    } catch (e) {
      console.error("Error fetching technical review:", e);
      return null;
    }
  }, [contract]);

  const getReviewRequested = useCallback(async (projectId, milestoneId) => {
    if (!contract) return false;
    try {
      return await contract.reviewRequested(projectId, milestoneId);
    } catch (e) {
      console.error("Error fetching review requested status:", e);
      return false;
    }
  }, [contract]);

  const getDisputeVotes = useCallback(async (projectId, milestoneId) => {
    if (!contract) return { payFreelancer: 0, refundClient: 0 };
    try {
      const pay = await contract.payFreelancerVotes(projectId, milestoneId);
      const refund = await contract.refundClientVotes(projectId, milestoneId);
      return { payFreelancer: Number(pay), refundClient: Number(refund) };
    } catch (e) {
      console.error("Error fetching dispute votes:", e);
      return { payFreelancer: 0, refundClient: 0 };
    }
  }, [contract]);

  const getHasVotedOnDispute = useCallback(async (projectId, milestoneId, arbitrator) => {
    if (!contract || !arbitrator) return false;
    try {
      return await contract.hasVotedOnDispute(projectId, milestoneId, arbitrator);
    } catch (e) {
      console.error("Error checking arbitrator voting status:", e);
      return false;
    }
  }, [contract]);

  return {
    contract, loading,
    getUserProjectIds, getProject, getMilestone,
    createProject, completeMilestone, approveMilestone, rejectMilestone,
    raiseDispute, resolveDispute, claimProject, cancelProject,
    getAccumulatedFees, withdrawFees,
    requestTechnicalReview, submitAuditReport, getTechnicalReview, getReviewRequested,
    getDisputeVotes, getHasVotedOnDispute,
  };
}
