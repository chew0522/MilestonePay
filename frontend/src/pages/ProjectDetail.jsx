import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";
import Icon from "../components/Icon";
import StatusBadge from "../components/StatusBadge";

export default function ProjectDetail() {
  const { id } = useParams();
  const { account } = useWallet();
  const { getProject, getMilestone, completeMilestone, approveMilestone, rejectMilestone, raiseDispute, contract, loading } = useContract();
  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    async function load() {
      if (!contract) return;
      const p = await getProject(Number(id));
      if (!p) return;
      setProject(p);

      const ms = [];
      for (let i = 0; i < p.milestoneCount; i++) {
        const m = await getMilestone(Number(id), i);
        if (m) ms.push({ id: i, desc: m.description, value: m.amount, isCompleted: m.isCompleted, isApproved: m.isApproved });
      }
      setMilestones(ms);
    }
    load();
  }, [id, contract, getProject, getMilestone, refresh]);

  const isClient = account?.toLowerCase() === project?.client?.toLowerCase();
  const isFreelancer = account?.toLowerCase() === project?.freelancer?.toLowerCase();

  const getStatus = (m) => {
    if (m.isApproved) return "approved";
    if (m.isCompleted) return "completed";
    return "pending";
  };

  const statusLabel = (m) => {
    if (m.isApproved) return "APPROVED";
    if (m.isCompleted) return "COMPLETED";
    return "PENDING";
  };

  const total = project ? parseFloat(project.totalAmount) : 0;
  const released = milestones.filter((m) => m.isApproved).reduce((s, m) => s + parseFloat(m.value), 0);
  const remaining = total - released;

  const doAction = async (fn) => {
    try {
      await fn();
      setRefresh((r) => r + 1);
    } catch (e) {
      alert("Transaction failed");
    }
  };

  if (!project) return <main className="flex-grow flex items-center justify-center"><p className="text-on-surface-variant">Loading project...</p></main>;

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-6 py-8 md:py-12"
      style={{ background: "radial-gradient(circle at top right, #1a1b4b, #0d141d 40%), radial-gradient(circle at bottom left, #23005c, #0d141d 40%)" }}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-[32px] leading-[40px] tracking-[-0.01em] font-bold">Project #{id}</h1>
            <StatusBadge label={project.state.toUpperCase()} variant={project.state.toLowerCase()} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card p-3 rounded-xl">
            <span className="text-[10px] tracking-[0.05em] font-semibold text-on-surface-variant">CLIENT</span>
            <p className="font-mono-md">{project.client.slice(0, 6)}...{project.client.slice(-4)}</p>
          </div>
          <div className="glass-card p-3 rounded-xl">
            <span className="text-[10px] tracking-[0.05em] font-semibold text-on-surface-variant">FREELANCER</span>
            <p className="font-mono-md">{project.freelancer.slice(0, 6)}...{project.freelancer.slice(-4)}</p>
          </div>
        </div>
      </div>

      {/* Budget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <BudgetCard label="TOTAL BUDGET" value={total.toFixed(2)} unit="ETH" color="text-primary" percent={100} bgColor="bg-primary" />
        <BudgetCard label="RELEASED" value={released.toFixed(2)} unit="ETH" color="text-tertiary" percent={total > 0 ? (released / total) * 100 : 0} bgColor="bg-tertiary" />
        <BudgetCard label="REMAINING" value={remaining.toFixed(2)} unit="ETH" color="text-secondary" percent={total > 0 ? (remaining / total) * 100 : 0} bgColor="bg-secondary" />
      </div>

      {/* Milestones */}
      <section className="glass-card rounded-2xl overflow-hidden mb-12">
        <div className="p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-[24px] leading-[32px] font-bold">Milestones</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/5 text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant border-b border-white/10">
              <tr>
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">DESCRIPTION</th>
                <th className="px-6 py-4">VALUE</th>
                <th className="px-6 py-4">STATUS</th>
                <th className="px-6 py-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {milestones.map((m, i) => (
                <tr key={m.id} className={`hover:bg-white/5 transition-colors ${i % 2 === 1 ? "bg-white/5" : ""}`}>
                  <td className="px-6 py-6 font-mono-md text-on-surface-variant">#{m.id + 1}</td>
                  <td className="px-6 py-6 font-medium">{m.desc || `Milestone ${m.id + 1}`}</td>
                  <td className="px-6 py-6 font-mono-md text-primary">{m.value} ETH</td>
                  <td className="px-6 py-6">
                    <StatusBadge label={statusLabel(m)} variant={getStatus(m)} />
                  </td>
                  <td className="px-6 py-6 text-right">
                    <MilestoneActions
                      m={m}
                      isClient={isClient}
                      isFreelancer={isFreelancer}
                      projectId={Number(id)}
                      loading={loading}
                      doAction={doAction}
                      completeMilestone={completeMilestone}
                      approveMilestone={approveMilestone}
                      rejectMilestone={rejectMilestone}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dispute */}
      {isClient || isFreelancer ? (
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 glass-card rounded-2xl border border-error/20">
          <div>
            <h4 className="text-[24px] leading-[32px] font-bold mb-2">Need Assistance?</h4>
            <p className="text-body-md text-on-surface-variant">Raising a dispute will lock the remaining funds and involve a neutral arbiter.</p>
          </div>
          <button onClick={() => doAction(() => raiseDispute(Number(id)))}
            disabled={loading}
            className="group flex items-center gap-2 border border-error/50 text-error px-8 py-3 rounded-full font-semibold hover:bg-error/10 transition-all active:scale-95"
          >
            <Icon className="group-hover:rotate-12 transition-transform">report_problem</Icon>
            Raise Dispute
          </button>
        </div>
      ) : null}
    </main>
  );
}

function BudgetCard({ label, value, unit, color, percent, bgColor }) {
  return (
    <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
      <h3 className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">{label}</h3>
      <p className={`${color} text-[48px] leading-[56px] tracking-[-0.02em] font-bold`}>{value} <span className="font-mono-md text-2xl">{unit}</span></p>
      <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${bgColor}`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

function MilestoneActions({ m, isClient, isFreelancer, projectId, loading, doAction, completeMilestone, approveMilestone, rejectMilestone }) {
  if (m.isApproved) {
    return <span className="text-on-surface-variant italic opacity-50">Locked</span>;
  }
  if (m.isCompleted) {
    if (isClient) {
      return (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => doAction(() => approveMilestone(projectId, m.id))} disabled={loading}
            className="bg-tertiary/20 hover:bg-tertiary/30 text-tertiary px-4 py-2 rounded-lg text-[12px] font-semibold border border-tertiary/20">Approve</button>
          <button onClick={() => doAction(() => rejectMilestone(projectId, m.id))} disabled={loading}
            className="bg-error/10 hover:bg-error/20 text-error px-4 py-2 rounded-lg text-[12px] font-semibold border border-error/20">Reject</button>
        </div>
      );
    }
    return <span className="text-on-surface-variant italic">Awaiting client</span>;
  }
  if (isFreelancer) {
    return (
      <button onClick={() => doAction(() => completeMilestone(projectId, m.id))} disabled={loading}
        className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg text-[12px] font-semibold border border-primary/20">Mark Complete</button>
    );
  }
  return <span className="text-on-surface-variant italic opacity-50">—</span>;
}
