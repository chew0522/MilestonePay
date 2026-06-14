import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import MilestonePayABI from "./MilestonePayABI.json";
import { useWallet } from "./WalletContext";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

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
      };
    } catch (e) {
      return null;
    }
  }, [contract]);

  const createProject = useCallback(async (freelancer, count, descriptions, percentages, valueEth) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.createProject(freelancer, count, descriptions, percentages, {
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

  const completeMilestone = useCallback(async (projectId, milestoneId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.completeMilestone(projectId, milestoneId);
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
      const tx = await contract.approveMilestone(projectId, milestoneId);
      await tx.wait();
    } catch (e) {
      console.error("Approve milestone failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const rejectMilestone = useCallback(async (projectId, milestoneId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.rejectMilestone(projectId, milestoneId);
      await tx.wait();
    } catch (e) {
      console.error("Reject milestone failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const raiseDispute = useCallback(async (projectId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.raiseDispute(projectId);
      await tx.wait();
    } catch (e) {
      console.error("Raise dispute failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  const resolveDispute = useCallback(async (projectId, payFreelancer) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.resolveDispute(projectId, payFreelancer);
      await tx.wait();
    } catch (e) {
      console.error("Resolve dispute failed:", e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [contract]);

  return {
    contract, loading,
    getUserProjectIds, getProject, getMilestone,
    createProject, completeMilestone, approveMilestone, rejectMilestone,
    raiseDispute, resolveDispute,
  };
}
