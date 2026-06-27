import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useParams } from "react-router-dom";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";
import Icon from "../components/Icon";
import StatusBadge from "../components/StatusBadge";

export default function ProjectDetail() {
  const { id } = useParams();
  const { account } = useWallet();
  const { getProject, getMilestone, completeMilestone, approveMilestone, rejectMilestone, raiseDispute, claimProject, cancelProject, contract, loading, requestTechnicalReview, getTechnicalReview, getReviewRequested, getDisputeVotes, submitAuditReport } = useContract();
  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [history, setHistory] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [rejectMilestoneId, setRejectMilestoneId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [milestoneReviewRequested, setMilestoneReviewRequested] = useState({});
  const [milestoneReviews, setMilestoneReviews] = useState({});
  const [milestoneVotes, setMilestoneVotes] = useState({});
  const [isTechStaff, setIsTechStaff] = useState(false);
  const [auditReport, setAuditReport] = useState("");
  const [auditReportMilestoneId, setAuditReportMilestoneId] = useState(null);
  const [auditPass, setAuditPass] = useState(true);
  const [toast, setToast] = useState(null);
  const [submitMilestoneId, setSubmitMilestoneId] = useState(null);
  const [submissionText, setSubmissionText] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const formatDate = (timestamp) => {
    if (!timestamp || timestamp === 0) return "Not Set";
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDeadlineText = (deadline) => {
    if (!deadline || deadline === 0) return "Not Set";
    const now = Math.floor(Date.now() / 1000);
    const diff = deadline - now;
    if (diff <= 0) {
      return "Overdue";
    }
    const days = Math.floor(diff / 86400);
    if (days > 0) {
      return `${days} days left`;
    }
    const hours = Math.floor(diff / 3600);
    if (hours > 0) {
      return `${hours} hours left`;
    }
    return "Less than an hour left";
  };

  useEffect(() => {
    async function load() {
      if (!contract) return;
      const p = await getProject(Number(id));
      if (!p) return;
      setProject(p);

      const ms = [];
      const votesMap = {};
      const requestedMap = {};
      const reviewsMap = {};

      for (let i = 0; i < p.milestoneCount; i++) {
        const m = await getMilestone(Number(id), i);
        if (m) {
          ms.push({ 
            id: i, 
            desc: m.description, 
            value: m.amount, 
            isCompleted: m.isCompleted, 
            isApproved: m.isApproved, 
            rejectionReason: m.rejectionReason,
            isDisputed: m.isDisputed,
            submissionDetail: m.submissionDetail
          });

          if (m.isDisputed) {
            const v = await getDisputeVotes(Number(id), i);
            votesMap[i] = v;

            const isReq = await getReviewRequested(Number(id), i);
            requestedMap[i] = isReq;
            if (isReq) {
              const rev = await getTechnicalReview(Number(id), i);
              reviewsMap[i] = rev;
            }
          }
        }
      }
      setMilestones(ms);
      setMilestoneVotes(votesMap);
      setMilestoneReviewRequested(requestedMap);
      setMilestoneReviews(reviewsMap);

      if (account) {
        try {
          const techRole = await contract.TECHNICAL_STAFF_ROLE();
          const hasTech = await contract.hasRole(techRole, account);
          setIsTechStaff(hasTech);
        } catch (e) {
          console.error("Error checking tech staff role:", e);
          setIsTechStaff(false);
        }
      } else {
        setIsTechStaff(false);
      }

      // Fetch on-chain transaction history events
      try {
        const createdFilter = contract.filters.ProjectCreated(Number(id));
        const approvedFilter = contract.filters.MilestoneApproved(Number(id));
        const rejectedFilter = contract.filters.MilestoneRejected(Number(id));
        const disputeFilter = contract.filters.DisputeRaised(Number(id));
        const resolvedFilter = contract.filters.DisputeResolved(Number(id));
        const cancelledFilter = contract.filters.ProjectCancelled(Number(id));
        const reqReviewFilter = contract.filters.TechnicalReviewRequested(Number(id));
        const subReviewFilter = contract.filters.TechnicalReviewSubmitted(Number(id));

        const [createdEvs, approvedEvs, rejectedEvs, disputeEvs, resolvedEvs, cancelledEvs, reqReviewEvs, subReviewEvs] = await Promise.all([
          contract.queryFilter(createdFilter),
          contract.queryFilter(approvedFilter),
          contract.queryFilter(rejectedFilter),
          contract.queryFilter(disputeFilter),
          contract.queryFilter(resolvedFilter),
          contract.queryFilter(cancelledFilter),
          contract.queryFilter(reqReviewFilter),
          contract.queryFilter(subReviewFilter)
        ]);

        const list = [];
        for (const ev of createdEvs) {
          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "Deposit",
            detail: "Project created & escrow funded",
            amount: `+${ethers.formatEther(ev.args.totalAmount)} ETH`,
            status: "Success"
          });
        }
        for (const ev of approvedEvs) {
          const net = parseFloat(ethers.formatEther(ev.args.amount));
          const gross = net / 0.97;
          const fee = gross * 0.03;

          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "Payout",
            detail: `Milestone #${Number(ev.args.milestoneId) + 1} Approved`,
            grossValue: gross.toFixed(4),
            feeValue: fee.toFixed(4),
            amountValue: ethers.formatEther(ev.args.amount),
            status: "Transferred"
          });
        }
        for (const ev of rejectedEvs) {
          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "Rejection",
            detail: `Milestone #${Number(ev.args.milestoneId) + 1} Rejected: "${ev.args.reason}"`,
            amount: "—",
            status: "Rejected"
          });
        }
        for (const ev of disputeEvs) {
          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "Dispute",
            detail: `Dispute raised on Milestone #${Number(ev.args.milestoneId) + 1}`,
            amount: "—",
            status: "Locked"
          });
        }
        for (const ev of resolvedEvs) {
          const mId = Number(ev.args.milestoneId);
          const mAmountStr = ms[mId] ? ms[mId].value : "0";
          const gross = parseFloat(mAmountStr);
          const fee = gross * 0.03;
          const net = gross - fee;

          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "Resolution",
            detail: ev.args.refunded 
              ? `Refunded Milestone #${mId + 1} to client` 
              : `Paid Milestone #${mId + 1} to freelancer`,
            refunded: ev.args.refunded,
            grossValue: gross.toFixed(4),
            feeValue: fee.toFixed(4),
            amountValue: net.toFixed(4),
            amount: ev.args.refunded ? `${gross.toFixed(4)} ETH` : `${net.toFixed(4)} ETH`,
            status: "Resolved"
          });
        }
        for (const ev of cancelledEvs) {
          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "Cancellation",
            detail: "Project cancelled, funds refunded",
            amount: `-${p.totalAmount} ETH`,
            status: "Refunded"
          });
        }
        for (const ev of reqReviewEvs) {
          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "AuditReq",
            detail: `Audit requested on Milestone #${Number(ev.args.milestoneId) + 1}`,
            amount: "—",
            status: "Pending"
          });
        }
        for (const ev of subReviewEvs) {
          list.push({
            txHash: ev.transactionHash,
            blockNumber: Number(ev.blockNumber),
            type: "AuditSub",
            detail: `Technical audit report submitted for Milestone #${Number(ev.args.milestoneId) + 1}: ${ev.args.recommendedPass ? "PASS" : "FAIL"}`,
            subdetail: `Auditor feedback: "${ev.args.report}"`,
            amount: "—",
            status: "Audited"
          });
        }

        list.sort((a, b) => b.blockNumber - a.blockNumber);
        setHistory(list);
      } catch (err) {
        console.error("Error fetching project history:", err);
      }
    }
    load();
  }, [id, contract, getProject, getMilestone, refresh, account]);

  const isClient = account?.toLowerCase() === project?.client?.toLowerCase();
  const isFreelancer = account?.toLowerCase() === project?.freelancer?.toLowerCase();

  const getStatus = (m) => {
    if (m.isApproved) return "approved";
    if (m.isDisputed) return "error";
    if (m.isCompleted) return "completed";
    if (m.rejectionReason) return "rejected";
    return "pending";
  };

  const statusLabel = (m) => {
    if (m.isApproved) return "APPROVED";
    if (m.isDisputed) return "DISPUTED";
    if (m.isCompleted) return "COMPLETED";
    if (m.rejectionReason) return "REJECTED";
    return "PENDING";
  };

  const total = project ? parseFloat(project.totalAmount) : 0;
  const remaining = (project && project.state !== "Cancelled")
    ? milestones
        .filter(m => !m.isApproved)
        .reduce((sum, m) => sum + parseFloat(m.value), 0)
    : 0;
  const released = milestones
    .filter(m => m.isApproved)
    .reduce((sum, m) => sum + parseFloat(m.value), 0);

  const doAction = async (fn) => {
    try {
      await fn();
      setRefresh((r) => r + 1);
    } catch (e) {
      showToast("Transaction failed", "error");
    }
  };

  const handleAuditSubmit = async (e, milestoneId) => {
    e.preventDefault();
    if (auditReport.trim() === "") return;
    try {
      await submitAuditReport(Number(id), milestoneId, auditReport.trim(), auditPass);
      showToast("Technical audit report successfully submitted!");
      setAuditReport("");
      setAuditReportMilestoneId(null);
      setRefresh((r) => r + 1);
    } catch (err) {
      showToast("Audit submission failed.", "error");
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-3 rounded-xl">
            <span className="text-[10px] tracking-[0.05em] font-semibold text-on-surface-variant">CLIENT</span>
            <p className="font-mono-md">{project.client.slice(0, 6)}...{project.client.slice(-4)}</p>
          </div>
          <div className="glass-card p-3 rounded-xl">
            <span className="text-[10px] tracking-[0.05em] font-semibold text-on-surface-variant">FREELANCER</span>
            <p className="font-mono-md">
              {project.freelancer === "0x0000000000000000000000000000000000000000"
                ? "Unassigned"
                : `${project.freelancer.slice(0, 6)}...${project.freelancer.slice(-4)}`}
            </p>
          </div>
          <div className="glass-card p-3 rounded-xl">
            <span className="text-[10px] tracking-[0.05em] font-semibold text-on-surface-variant">DATE CREATED</span>
            <p className="font-sans text-sm font-semibold text-white mt-1">{formatDate(project.createdAt)}</p>
          </div>
          <div className="glass-card p-3 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.05em] font-semibold text-on-surface-variant">DEADLINE</span>
              {project.deadline > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  project.deadline < Math.floor(Date.now() / 1000) 
                    ? "bg-error/20 text-error border border-error/20" 
                    : "bg-tertiary/20 text-tertiary border border-tertiary/20"
                }`}>
                  {getDeadlineText(project.deadline).toUpperCase()}
                </span>
              )}
            </div>
            <p className="font-sans text-sm font-semibold text-white mt-1">{formatDate(project.deadline)}</p>
          </div>
        </div>
      </div>

      {/* Title & Description Card */}
      {project.title && (
        <div className="glass-card p-6 rounded-2xl mb-12 border border-white/5 bg-white/5 animate-fade-in">
          <h3 className="text-xl font-bold text-white mb-2">{project.title}</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap font-sans">{project.description}</p>
        </div>
      )}

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
                  <td className="px-6 py-6 font-medium">
                    <div>{m.desc || `Milestone ${m.id + 1}`}</div>
                    {m.submissionDetail && (
                      <div className="mt-2 text-[12px] text-tertiary bg-tertiary/10 border border-tertiary/20 rounded-lg px-3 py-2 flex items-start gap-1.5 max-w-md">
                        <Icon className="text-[16px] mt-0.5 select-none text-tertiary">check_circle</Icon>
                        <div>
                          <span className="font-bold">Submission Proof:</span> {m.submissionDetail}
                        </div>
                      </div>
                    )}
                    {m.rejectionReason && (
                      <div className="mt-2 text-[12px] text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2 flex items-start gap-1.5 max-w-md">
                        <Icon className="text-[16px] mt-0.5 select-none text-error">warning</Icon>
                        <div>
                          <span className="font-bold">Rejection Feedback:</span> {m.rejectionReason}
                        </div>
                      </div>
                    )}
                  </td>
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
                      onRejectClick={(milestoneId) => {
                        setRejectMilestoneId(milestoneId);
                        setRejectReason("");
                      }}
                      onSubmitClick={(milestoneId) => {
                        setSubmitMilestoneId(milestoneId);
                        setSubmissionText("");
                      }}
                      projectState={project?.state}
                      raiseDispute={raiseDispute}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Claim Banner */}
      {project.freelancer === "0x0000000000000000000000000000000000000000" ? (
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 glass-card rounded-2xl border border-tertiary/20 mb-8">
          <div>
            <h4 className="text-[24px] leading-[32px] font-bold mb-2 text-tertiary">Open Project</h4>
            <p className="text-body-md text-on-surface-variant">This project has not been claimed yet. If you are a freelancer, you can claim this gig to start working on the milestones.</p>
          </div>
          <button
            onClick={() => doAction(() => claimProject(Number(id)))}
            disabled={loading || isClient}
            className="glow-button px-8 py-3 rounded-full font-semibold flex items-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            title={isClient ? "You cannot claim your own project" : ""}
          >
            <Icon>pan_tool</Icon> Claim Gig
          </button>
        </div>
      ) : null}

      {/* Active Milestone Disputes Panel */}
      {milestones.filter(m => m.isDisputed).map((m) => {
        const votes = milestoneVotes[m.id] || { payFreelancer: 0, refundClient: 0 };
        const reviewRequested = milestoneReviewRequested[m.id] || false;
        const techReview = milestoneReviews[m.id] || null;

        return (
          <div key={m.id} className="flex flex-col gap-6 p-8 glass-card rounded-2xl border border-error/30 mb-12 animate-fade-in">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div>
                <h4 className="text-[24px] leading-[32px] font-bold text-error flex items-center gap-2">
                  <Icon className="animate-pulse">gavel</Icon> Dispute Active on Milestone #{m.id + 1}
                </h4>
                <p className="text-body-md text-on-surface-variant mt-1">
                  Milestone: <span className="text-white font-medium">"{m.desc || `Milestone ${m.id + 1}`}"</span> | Value: <span className="text-primary font-bold">{parseFloat(m.value).toFixed(2)} ETH</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-on-surface-variant/80">TECHNICAL REVIEW:</span>
                {reviewRequested ? (
                  techReview?.isSubmitted ? (
                    <span className="bg-tertiary/10 border border-tertiary/20 text-tertiary px-3 py-1 rounded-full text-[10px] font-bold">AUDITED</span>
                  ) : (
                    <span className="bg-secondary/15 border border-secondary/30 text-secondary px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">PENDING AUDIT</span>
                  )
                ) : (
                  <span className="bg-white/5 border border-white/10 text-on-surface-variant px-3 py-1 rounded-full text-[10px] font-bold">NOT REQUESTED</span>
                )}
              </div>
            </div>

            {/* Voting Tally Progress for Client/Freelancer */}
            <div className="p-6 bg-white/5 rounded-xl border border-white/5 text-sm space-y-3">
              <h5 className="font-bold text-white text-base flex items-center gap-2 border-b border-white/5 pb-2">
                <Icon className="text-primary text-xl">how_to_vote</Icon> Dispute Resolution Voting
              </h5>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-grow">
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Decentralized dispute resolution is governed by platform admins. Individual voting choices are kept confidential. The dispute will be resolved and executed only after **all 3 admins have voted**, and the final outcome will follow the majority decision (2/3).
                  </p>
                  <div className="flex gap-6 mt-3 font-mono-md font-bold text-sm">
                    <span className="text-primary flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-primary rounded-full inline-block"></span>
                      Votes Cast: {votes.payFreelancer + votes.refundClient} / 3 votes
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Status Section */}
            {!reviewRequested ? (
              (isClient || isFreelancer) && (
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex-1">
                    <h5 className="font-bold text-white text-base">Request Technical Audit</h5>
                    <p className="text-sm text-on-surface-variant mt-1">
                      You can request a platform Technical Auditor to review the milestone code and details on-chain. This provides objective technical evidence for the arbitrator's ruling.
                    </p>
                  </div>
                  <button
                    onClick={() => doAction(() => requestTechnicalReview(Number(id), m.id))}
                    disabled={loading}
                    className="glow-button px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-white border border-primary/30 active:scale-95 transition-all text-[12px] cursor-pointer"
                  >
                    <Icon>psychology</Icon> Request Tech Review
                  </button>
                </div>
              )
            ) : !techReview?.isSubmitted ? (
              isTechStaff ? (
                <form onSubmit={(e) => handleAuditSubmit(e, m.id)} className="p-6 bg-secondary/5 rounded-xl border border-secondary/20 space-y-4">
                  <h5 className="font-bold text-white text-base flex items-center gap-2 border-b border-white/5 pb-2">
                    <Icon className="text-secondary text-lg">rate_review</Icon> Submit Technical Audit Report
                  </h5>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    You are connected as a platform **Technical Auditor**. Please review the milestones and transaction ledger below and submit your on-chain findings for **Milestone #{m.id + 1}**.
                  </p>
                  
                  <div>
                    <label className="block text-[11px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
                      RECOMMENDATION
                    </label>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <button
                        onClick={() => setAuditPass(true)}
                        type="button"
                        className={`py-2 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer ${
                          auditPass 
                            ? "bg-tertiary/10 border-tertiary text-tertiary font-bold" 
                            : "bg-white/5 border-white/10 text-on-surface-variant hover:text-white"
                        }`}
                      >
                        Pass (Recommend Freelancer Payout)
                      </button>
                      <button
                        onClick={() => setAuditPass(false)}
                        type="button"
                        className={`py-2 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer ${
                          !auditPass 
                            ? "bg-error/10 border-error text-error font-bold" 
                            : "bg-white/5 border-white/10 text-on-surface-variant hover:text-white"
                        }`}
                      >
                        Fail (Recommend Client Refund)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] tracking-[0.05em] font-semibold text-on-surface-variant">
                      AUDIT REPORT & FEEDBACK
                    </label>
                    <textarea
                      value={auditReport}
                      onChange={(e) => {
                        setAuditReport(e.target.value);
                        setAuditReportMilestoneId(m.id);
                      }}
                      placeholder="Describe your technical assessment of the deliverables..."
                      rows="4"
                      className="w-full bg-white/5 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl p-3 text-sm text-white placeholder-white/30 outline-none resize-none transition-all"
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || auditReport.trim() === "" || auditReportMilestoneId !== m.id}
                    className="glow-button px-6 py-2.5 rounded-xl bg-secondary text-white text-[12px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95 border border-secondary/30 cursor-pointer"
                  >
                    <Icon className="text-base">assignment_turned_in</Icon>
                    {loading ? "Submitting Report..." : "Submit On-Chain Audit"}
                  </button>
                </form>
              ) : (
                <div className="p-6 bg-secondary/5 rounded-xl border border-secondary/10 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20 flex-shrink-0 animate-pulse">
                    <Icon>hourglass_empty</Icon>
                  </div>
                  <div>
                    <h5 className="font-bold text-white text-base">Awaiting Technical Audit Report</h5>
                    <p className="text-sm text-on-surface-variant mt-1">
                      Technical review requested. An authorized Technical Staff member has been assigned to audit the project code. The report will appear here once submitted.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="p-6 bg-white/5 rounded-xl border border-white/5 space-y-4">
                <h5 className="font-bold text-white text-base flex items-center gap-2 border-b border-white/5 pb-2">
                  <Icon className="text-tertiary">assignment_turned_in</Icon> Technical Auditor Report
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[11px] font-semibold text-on-surface-variant/70 block">AUDITOR</span>
                    <p className="font-mono-md text-white mt-0.5">{techReview.staff.slice(0, 8)}...{techReview.staff.slice(-6)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-on-surface-variant/70 block">RECOMMENDATION</span>
                    <p className={`font-bold mt-0.5 flex items-center gap-1.5 ${techReview.recommendedPass ? "text-tertiary" : "text-error"}`}>
                      <Icon className="text-base">{techReview.recommendedPass ? "check_circle" : "cancel"}</Icon>
                      {techReview.recommendedPass ? "PASS (Recommend Freelancer Payout)" : "FAIL (Recommend Client Refund)"}
                    </p>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-on-surface-variant/70 block">AUDITOR FEEDBACK & FINDINGS</span>
                  <div className="mt-2 bg-black/30 p-4 rounded-xl text-sm border border-white/5 text-white/90 leading-relaxed font-mono-md">
                    {techReview.report}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Transaction History Ledger */}
      <section className="glass-card rounded-2xl overflow-hidden mb-12">
        <div className="p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-[24px] leading-[32px] font-bold">Transaction Ledger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/5 text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant border-b border-white/10">
              <tr>
                <th className="px-6 py-4">BLOCK</th>
                <th className="px-6 py-4">TYPE</th>
                <th className="px-6 py-4">DETAILS</th>
                <th className="px-6 py-4">AMOUNT</th>
                <th className="px-6 py-4 text-right">TX HASH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {history.map((h, i) => (
                <tr key={h.txHash + i} className={`hover:bg-white/5 transition-colors ${i % 2 === 1 ? "bg-white/5" : ""}`}>
                  <td className="px-6 py-4 font-mono-md text-on-surface-variant text-sm">#{h.blockNumber}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                      h.type === "Deposit" ? "bg-primary/20 text-primary border border-primary/20" :
                      h.type === "Payout" ? "bg-tertiary/20 text-tertiary border border-tertiary/20" :
                      h.type === "Dispute" ? "bg-error/20 text-error border border-error/20" :
                      h.type === "Rejection" ? "bg-error/20 text-error border border-error/20" :
                      h.type === "AuditReq" ? "bg-secondary/20 text-secondary border border-secondary/20" :
                      h.type === "AuditSub" ? "bg-tertiary/20 text-tertiary border border-tertiary/20" :
                      "bg-white/10 text-on-surface-variant"
                    }`}>
                      {h.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-on-surface">
                    <div>{h.detail}</div>
                    {(h.type === "Payout" || (h.type === "Resolution" && !h.refunded)) && (
                      <div className="text-[11px] font-normal text-on-surface-variant/70 mt-1">
                        {isFreelancer 
                          ? `Gross amount: ${h.grossValue} ETH | Platform Fee: ${h.feeValue} ETH (3%)`
                          : `Freelancer net: ${parseFloat(h.amountValue).toFixed(4)} ETH | Platform Fee: ${h.feeValue} ETH (3%)`}
                      </div>
                    )}
                  </td>
                  <td className={`px-6 py-4 font-mono-md font-bold ${
                    h.type === "Deposit" ? "text-primary" :
                    h.type === "Payout" ? (isFreelancer ? "text-tertiary" : "text-error") :
                    h.type === "Resolution" ? (
                      h.refunded 
                        ? "text-on-surface-variant"
                        : (isFreelancer ? "text-tertiary" : "text-error")
                    ) :
                    h.type === "Cancellation" ? "text-error" :
                    "text-on-surface-variant"
                  }`}>
                    {h.type === "Payout"
                      ? (isFreelancer ? `+${parseFloat(h.amountValue).toFixed(4)} ETH` : `-${h.grossValue} ETH`)
                      : h.type === "Resolution"
                        ? (h.refunded
                            ? "—"
                            : (isFreelancer ? `+${parseFloat(h.amountValue).toFixed(4)} ETH` : `-${parseFloat(h.grossValue).toFixed(4)} ETH`)
                          )
                        : h.amount}
                  </td>
                  <td className="px-6 py-4 text-right font-mono-md text-xs text-primary">
                    <span className="opacity-75">
                      {h.txHash.slice(0, 6)}...{h.txHash.slice(-4)}
                    </span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-on-surface-variant">No transaction records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Danger Zone */}
      {isClient && project.state === "Active" && (project.completedMilestones === 0 || (project.deadline > 0 && Math.floor(Date.now() / 1000) > project.deadline)) && (
        <div className="glass-card p-6 rounded-2xl border border-error/25 flex flex-col md:flex-row items-center justify-between gap-6 mb-12 animate-fade-in bg-error/5">
          <div className="flex-1 text-center md:text-left">
            <h4 className="text-lg font-bold text-error flex items-center gap-2 justify-center md:justify-start">
              <Icon>warning</Icon> Danger Zone: Cancel Project
            </h4>
            <p className="text-sm text-on-surface-variant/80 mt-1">
              Cancelling this project will release all remaining escrow funds back to your wallet. This action is irreversible.
            </p>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to cancel this project? Your full remaining escrow deposit will be refunded to your wallet.")) {
                doAction(() => cancelProject(Number(id)));
              }
            }}
            disabled={loading}
            className="w-full md:w-auto bg-error hover:bg-error/80 text-black font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-error/20 border border-error/30 text-sm whitespace-nowrap"
          >
            <Icon className="text-lg">cancel</Icon> Cancel Project & Refund Escrow
          </button>
        </div>
      )}

      {/* Submit Milestone Modal */}
      {submitMilestoneId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-primary/5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Icon className="text-xl">publish</Icon>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Submit Milestone #{submitMilestoneId + 1}</h3>
                <p className="text-[11px] text-on-surface-variant font-medium">Provide proof of work or deliverables</p>
              </div>
            </div>
            <div className="p-6">
              <label className="block text-[11px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
                DELIVERABLE DETAILS / LINKS
              </label>
              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="e.g. GitHub PR Link, hosting URL, or summary of deliverables..."
                rows="4"
                className="w-full glass-input rounded-xl px-4 py-3 text-white placeholder:text-on-surface-variant/30 text-sm focus:border-primary/50 resize-none font-sans"
              />
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setSubmitMilestoneId(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-2.5 px-4 rounded-xl border border-white/10 text-sm cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading || !submissionText.trim()}
                  onClick={() => {
                    doAction(async () => {
                      await completeMilestone(Number(id), submitMilestoneId, submissionText.trim());
                      setSubmitMilestoneId(null);
                      showToast(`Milestone #${submitMilestoneId + 1} submitted successfully!`);
                    });
                  }}
                  className="flex-1 bg-primary hover:bg-primary/80 text-black font-bold py-2.5 px-4 rounded-xl text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
                >
                  {loading ? "Submitting..." : "Submit Work"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Feedback Modal */}
      {rejectMilestoneId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl border border-error/20 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-error/5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error border border-error/20">
                <Icon className="text-xl">warning</Icon>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Reject Milestone #{rejectMilestoneId + 1}</h3>
                <p className="text-[11px] text-on-surface-variant font-medium">Provide feedback to the freelancer</p>
              </div>
            </div>
            <div className="p-6">
              <label className="block text-[11px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
                REJECTION REASON / FEEDBACK
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Describe what needs to be fixed or updated in this milestone..."
                rows="4"
                className="w-full bg-white/5 border border-white/10 focus:border-error focus:ring-1 focus:ring-error rounded-xl p-3 text-sm text-white placeholder-white/30 outline-none resize-none transition-all"
                disabled={loading}
              />
            </div>
            <div className="p-6 bg-white/5 border-t border-white/5 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setRejectMilestoneId(null);
                  setRejectReason("");
                }}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-[12px] font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (rejectReason.trim() === "") return;
                  await doAction(() => rejectMilestone(Number(id), rejectMilestoneId, rejectReason.trim()));
                  setRejectMilestoneId(null);
                  setRejectReason("");
                }}
                disabled={loading || rejectReason.trim() === ""}
                className="px-5 py-2.5 rounded-xl bg-error hover:bg-error/80 text-white text-[12px] font-semibold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-error/20 border border-error/30"
              >
                {loading ? "Rejecting..." : "Submit Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl transition-all ${
          toast.type === "success" 
            ? "bg-tertiary/10 border-tertiary/40 text-tertiary" 
            : "bg-error/10 border-error/40 text-error"
        }`}>
          <Icon className="text-lg">{toast.type === "success" ? "check_circle" : "error"}</Icon>
          <span className="text-sm font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80 text-sm cursor-pointer">
            <Icon className="text-base leading-none">close</Icon>
          </button>
        </div>
      )}
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

function MilestoneActions({ m, isClient, isFreelancer, projectId, loading, doAction, completeMilestone, approveMilestone, onRejectClick, onSubmitClick, projectState, raiseDispute }) {
  if (projectState !== "Active") {
    if (m.isApproved) {
      return <span className="text-on-surface-variant italic opacity-50">Approved</span>;
    }
    return <span className="text-on-surface-variant italic opacity-50">—</span>;
  }
  if (m.isApproved) {
    return <span className="text-on-surface-variant italic opacity-50">Locked</span>;
  }
  if (m.isDisputed) {
    return <span className="text-error italic font-bold">Disputed</span>;
  }
  if (m.isCompleted) {
    if (isClient) {
      return (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => doAction(() => approveMilestone(projectId, m.id))} disabled={loading}
            className="bg-tertiary/20 hover:bg-tertiary/30 text-tertiary px-4 py-2 rounded-lg text-[12px] font-semibold border border-tertiary/20 cursor-pointer">Approve</button>
          <button onClick={() => onRejectClick(m.id)} disabled={loading}
            className="bg-error/10 hover:bg-error/20 text-error px-4 py-2 rounded-lg text-[12px] font-semibold border border-error/20 cursor-pointer">Reject</button>
          <button onClick={() => doAction(() => raiseDispute(projectId, m.id))} disabled={loading}
            className="bg-error/20 hover:bg-error/30 text-error px-4 py-2 rounded-lg text-[12px] font-semibold border border-error/30 cursor-pointer" title="Raise Dispute">Dispute</button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-end gap-3">
        <span className="text-on-surface-variant italic text-sm">Awaiting client approval</span>
      </div>
    );
  }
  if (isFreelancer) {
    if (m.rejectionReason) {
      return (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => onSubmitClick(m.id)} disabled={loading}
            className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg text-[12px] font-semibold border border-primary/20 cursor-pointer">Resubmit</button>
          <button onClick={() => doAction(() => raiseDispute(projectId, m.id))} disabled={loading}
            className="bg-error/20 hover:bg-error/30 text-error px-4 py-2 rounded-lg text-[12px] font-semibold border border-error/30 cursor-pointer">Dispute</button>
        </div>
      );
    }
    return (
      <button onClick={() => onSubmitClick(m.id)} disabled={loading}
        className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg text-[12px] font-semibold border border-primary/20 cursor-pointer">Mark Complete</button>
    );
  }
  return <span className="text-on-surface-variant italic opacity-50">—</span>;
}
