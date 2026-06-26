import { useState, useEffect } from "react";
import { useContract } from "../useContract";
import { ethers } from "ethers";
import { useWallet } from "../WalletContext";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import StatusBadge from "../components/StatusBadge";

export default function AdminDispute() {
  const { account } = useWallet();
  const { contract, getProject, getMilestone, resolveDispute, getAccumulatedFees, withdrawFees, getTechnicalReview, getReviewRequested, submitAuditReport, getDisputeVotes, getHasVotedOnDispute } = useContract();
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("disputed"); // "disputed", "active", "completed"
  const [accumulatedFees, setAccumulatedFees] = useState("0");
  const [arbitratorShare, setArbitratorShare] = useState("0");
  const [completedAuditsCount, setCompletedAuditsCount] = useState(0);
  const [totalAuditorFeesEarned, setTotalAuditorFeesEarned] = useState("0");
  const [pendingAuditsCount, setPendingAuditsCount] = useState(0);
  const [myCompletedAudits, setMyCompletedAudits] = useState([]);
  const [submitAuditProjectId, setSubmitAuditProjectId] = useState(null);
  const [submitAuditMilestoneId, setSubmitAuditMilestoneId] = useState(null);
  const [auditReport, setAuditReport] = useState("");
  const [auditPass, setAuditPass] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Access control state
  const [isArbitrator, setIsArbitrator] = useState(false);
  const [isTechStaff, setIsTechStaff] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  // 1. Verify if the connected wallet has the ARBITRATOR_ROLE / TECHNICAL_STAFF_ROLE
  useEffect(() => {
    async function checkRole() {
      if (contract && account) {
        try {
          const arbRole = await contract.ARBITRATOR_ROLE();
          const hasArb = await contract.hasRole(arbRole, account);
          setIsArbitrator(hasArb);

          const techRole = await contract.TECHNICAL_STAFF_ROLE();
          const hasTech = await contract.hasRole(techRole, account);
          setIsTechStaff(hasTech);
        } catch (e) {
          console.error("Error verifying roles:", e);
          setIsArbitrator(false);
          setIsTechStaff(false);
        }
      } else {
        setIsArbitrator(false);
        setIsTechStaff(false);
      }
      setCheckingRole(false);
    }
    checkRole();
  }, [contract, account]);

  // Set default active tab based on role
  useEffect(() => {
    if (!checkingRole) {
      if (isArbitrator) {
        setActiveTab("disputed");
      } else if (isTechStaff) {
        setActiveTab("audits");
      }
    }
  }, [checkingRole, isArbitrator, isTechStaff]);

  // 2. Load all platform projects and milestones globally
  useEffect(() => {
    async function load() {
      if (!contract || (!isArbitrator && !isTechStaff)) return;
      try {
        const count = await contract.nextProjectId();
        const projectsList = [];
        for (let id = 0; id < Number(count); id++) {
          const p = await getProject(id);
          if (p) {
            const milestoneCount = Number(p.milestoneCount);
            const ms = [];
            for (let i = 0; i < milestoneCount; i++) {
              const m = await getMilestone(id, i);
              if (m) {
                let review = null;
                let reviewReq = false;
                let votes = { payFreelancer: 0, refundClient: 0 };
                let hasVoted = false;
                if (m.isDisputed) {
                  reviewReq = await getReviewRequested(id, i);
                  if (reviewReq) {
                    review = await getTechnicalReview(id, i);
                  }
                  votes = await getDisputeVotes(id, i);
                  if (account) {
                    hasVoted = await getHasVotedOnDispute(id, i, account);
                  }
                }
                ms.push({ id: i, ...m, reviewRequested: reviewReq, review, votes, hasVoted });
              }
            }
            projectsList.push({ id, ...p, milestones: ms });
          }
        }
        setAllProjects(projectsList);

        // Fetch events to compute fees
        const [approvedEvs, resolvedEvs, auditorFeeEvs, subReviewEvs] = await Promise.all([
          contract.queryFilter(contract.filters.MilestoneApproved()),
          contract.queryFilter(contract.filters.DisputeResolved()),
          contract.queryFilter(contract.filters.AuditorFeePaid()),
          contract.queryFilter(contract.filters.TechnicalReviewSubmitted())
        ]);

        const auditorFeesPaid = {};
        for (const ev of auditorFeeEvs) {
          const pId = Number(ev.args.projectId);
          const mId = Number(ev.args.milestoneId);
          const amount = parseFloat(ethers.formatEther(ev.args.amount));
          if (!auditorFeesPaid[pId]) auditorFeesPaid[pId] = {};
          auditorFeesPaid[pId][mId] = amount;
        }

        const refundedMilestones = {};
        for (const ev of resolvedEvs) {
          if (ev.args.refunded) {
            const pId = Number(ev.args.projectId);
            const mId = Number(ev.args.milestoneId);
            if (!refundedMilestones[pId]) refundedMilestones[pId] = {};
            refundedMilestones[pId][mId] = true;
          }
        }

        let escrowTotal = 0;
        let shareTotal = 0;

        for (const p of projectsList) {
          let projectFee = 0;
          for (const m of p.milestones) {
            const value = parseFloat(m.amount);
            const auditorFee = (auditorFeesPaid[p.id] && auditorFeesPaid[p.id][m.id]) || 0;
            
            if (m.isApproved) {
              const grossFee = value * 0.03;
              projectFee += (grossFee - auditorFee);
            } else if (refundedMilestones[p.id] && refundedMilestones[p.id][m.id]) {
              projectFee -= auditorFee;
            }
          }

          if (p.state === "Completed") {
            if (projectFee > 0) {
              shareTotal += (projectFee / 3);
            }
          } else if (p.state === "Active" || p.state === "Disputed") {
            if (projectFee > 0) {
              escrowTotal += projectFee;
            }
          }
        }

        let auditorCompletedCount = 0;
        let auditorFeesSum = 0;
        
        for (const ev of auditorFeeEvs) {
          if (account && ev.args.auditor.toLowerCase() === account.toLowerCase()) {
            auditorCompletedCount++;
            auditorFeesSum += parseFloat(ethers.formatEther(ev.args.amount));
          }
        }

        let pendingCount = 0;
        for (const p of projectsList) {
          for (const m of p.milestones) {
            if (m.isDisputed && m.reviewRequested && (!m.review || !m.review.isSubmitted)) {
              pendingCount++;
            }
          }
        }

        const myAuditsList = [];
        for (const ev of subReviewEvs) {
          if (account && ev.args.staff.toLowerCase() === account.toLowerCase()) {
            const pId = Number(ev.args.projectId);
            const mId = Number(ev.args.milestoneId);
            
            const projObj = projectsList.find(p => p.id === pId);
            const mileObj = projObj ? projObj.milestones.find(m => m.id === mId) : null;
            
            myAuditsList.push({
              projectId: pId,
              milestoneId: mId,
              description: mileObj ? mileObj.description : `Milestone #${mId + 1}`,
              report: ev.args.report,
              recommendedPass: ev.args.recommendedPass,
              txHash: ev.transactionHash,
              blockNumber: Number(ev.blockNumber),
              projectState: projObj ? projObj.state : "Unknown"
            });
          }
        }
        myAuditsList.sort((a, b) => b.blockNumber - a.blockNumber);

        setAccumulatedFees(escrowTotal.toString());
        setArbitratorShare(shareTotal.toString());
        setCompletedAuditsCount(auditorCompletedCount);
        setTotalAuditorFeesEarned(auditorFeesSum.toString());
        setPendingAuditsCount(pendingCount);
        setMyCompletedAudits(myAuditsList);
      } catch (e) {
        console.error("Error loading global projects:", e);
      }
    }
    load();
  }, [contract, isArbitrator, isTechStaff, account, getProject, getMilestone, getReviewRequested, getTechnicalReview, getDisputeVotes, getHasVotedOnDispute, refresh]);

  const doResolve = async (projectId, milestoneId, payFreelancer) => {
    setLoading(true);
    try {
      await resolveDispute(projectId, milestoneId, payFreelancer);
      showToast("Dispute resolved successfully!");
      setRefresh((r) => r + 1);
    } catch (e) {
      showToast("Transaction failed", "error");
    }
    setLoading(false);
  };

  const handleWithdrawFees = async () => {
    setLoading(true);
    try {
      await withdrawFees();
      showToast("Platform fees successfully split and withdrawn!");
      setRefresh((r) => r + 1);
    } catch (e) {
      showToast("Withdrawal failed", "error");
    }
    setLoading(false);
  };

  // Render checking state
  if (checkingRole) {
    return (
      <main className="max-w-[1200px] mx-auto px-4 py-24 text-center">
        <p className="text-on-surface-variant animate-pulse">Verifying credentials...</p>
      </main>
    );
  }

  // Render Access Denied state
  if (!isArbitrator && !isTechStaff) {
    return (
      <main className="max-w-[1200px] mx-auto px-4 py-24 text-center">
        <Icon className="text-6xl text-error mb-4">gavel</Icon>
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-on-surface-variant max-w-md mx-auto">
          This section is restricted to platform arbitrators and technical staff. Please switch your wallet to an authorized account (Accounts 0, 1, or 2).
        </p>
      </main>
    );
  }

  const disputes = [];
  const auditsPending = [];
  for (const p of allProjects) {
    for (const m of p.milestones) {
      if (m.isDisputed) {
        disputes.push({ project: p, milestone: m });
        if (m.reviewRequested) {
          auditsPending.push({ project: p, milestone: m });
        }
      }
    }
  }

  const ongoing = allProjects.filter(p => p.state === "Active");
  const completed = allProjects.filter(p => p.state === "Completed" || p.state === "Cancelled");

  return (
    <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-12"
      style={{ background: "radial-gradient(circle at top right, #192029 0%, #0d141d 100%)" }}
    >
      <header className="mb-12">
        <h1 className="text-[48px] leading-[56px] tracking-[-0.02em] font-bold mb-2 text-primary">Admin Control Center</h1>
        <p className="text-body-md text-on-surface-variant max-w-2xl">
          Monitor all platform projects, track ongoing escrows, and resolve disputes.
        </p>
      </header>

      {/* Platform Fees Dashboard Panel for Arbitrators */}
      {isArbitrator && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-fade-in">
          <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
            <h3 className="text-[10px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
              TOTAL ESCROW FEES ACCUMULATED
            </h3>
            <p className="text-primary text-[36px] leading-[44px] font-bold">
              {parseFloat(accumulatedFees).toFixed(4)} <span className="font-mono-md text-xl">ETH</span>
            </p>
            <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: "100%" }}></div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
            <h3 className="text-[10px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
              YOUR ARBITRATOR SHARE
            </h3>
            <p className="text-tertiary text-[36px] leading-[44px] font-bold">
              {parseFloat(arbitratorShare).toFixed(4)} <span className="font-mono-md text-xl">ETH</span>
            </p>
            <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-tertiary" style={{ width: "100%" }}></div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl flex flex-col justify-center items-center gap-2 text-center">
            <Icon className="text-primary text-2xl animate-pulse">autorenew</Icon>
            <div>
              <h4 className="text-[10px] leading-[16px] font-semibold text-on-surface-variant">AUTOMATED PAYOUT</h4>
              <p className="text-[11px] text-on-surface-variant/70 mt-1">
                Escrow fees are split and distributed automatically to your wallet upon project completion.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Auditor Dashboard Panel for Technical Staff */}
      {isTechStaff && !isArbitrator && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-fade-in">
          <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
            <h3 className="text-[10px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
              AUDITS COMPLETED BY YOU
            </h3>
            <p className="text-primary text-[36px] leading-[44px] font-bold">
              {completedAuditsCount} <span className="font-mono-md text-xl">Reports</span>
            </p>
            <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: "100%" }}></div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
            <h3 className="text-[10px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
              YOUR AUDITOR EARNINGS (0.25%)
            </h3>
            <p className="text-tertiary text-[36px] leading-[44px] font-bold">
              {parseFloat(totalAuditorFeesEarned).toFixed(4)} <span className="font-mono-md text-xl">ETH</span>
            </p>
            <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-tertiary" style={{ width: "100%" }}></div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl flex flex-col justify-center items-center gap-2 text-center">
            <Icon className="text-secondary text-2xl animate-pulse">assignment</Icon>
            <div>
              <h4 className="text-[10px] leading-[16px] font-semibold text-on-surface-variant">PENDING AUDITS</h4>
              <p className="text-[11px] text-on-surface-variant/70 mt-1">
                There {pendingAuditsCount === 1 ? "is 1 milestone" : `are ${pendingAuditsCount} milestones`} awaiting your technical review.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between mb-8 border-b border-white/10">
        <div className="flex gap-6">
          {isArbitrator && (
            <>
              <button
                onClick={() => setActiveTab("disputed")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "disputed" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>gavel</Icon> Disputes ({disputes.length})
              </button>
              <button
                onClick={() => setActiveTab("active")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "active" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>hourglass_empty</Icon> Ongoing Gigs ({ongoing.length})
              </button>
              <button
                onClick={() => setActiveTab("completed")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "completed" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>check_circle</Icon> Completed ({completed.length})
              </button>
            </>
          )}
          {isTechStaff && (
            <>
              <button
                onClick={() => setActiveTab("audits")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "audits" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>psychology</Icon> Pending Audits ({auditsPending.length})
              </button>
              <button
                onClick={() => setActiveTab("my-audits")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "my-audits" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>history</Icon> My Completed Audits ({myCompletedAudits.length})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Disputes Tab Content */}
      {activeTab === "disputed" && (
        <div className="space-y-6">
          {disputes.length === 0 ? (
            <div className="glass-card p-12 rounded-xl text-center">
              <Icon className="text-4xl mb-3 text-on-surface-variant">check_circle</Icon>
              <p className="text-on-surface-variant">No active disputes to resolve.</p>
            </div>
          ) : (
            disputes.map(({ project: p, milestone: m }) => (
              <div key={`${p.id}-${m.id}`} className="glass-card rounded-xl p-8 border-l-4 border-l-primary/30 transition-all hover:bg-white/10">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="font-mono-md bg-primary/10 text-primary px-3 py-1 rounded-md">Project #{p.id}</span>
                      <span className="font-mono-md bg-secondary/10 text-secondary px-3 py-1 rounded-md">Milestone #{m.id + 1}</span>
                      <span className="flex items-center gap-1 text-[12px] font-semibold text-error border border-error/30 bg-error/5 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-error rounded-full animate-pulse"></span>
                        DISPUTED
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">"{m.description || `Milestone ${m.id + 1}`}"</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-[12px] font-semibold text-on-surface-variant/50 mb-1">CLIENT</p>
                        <p className="font-mono-md truncate text-sm">{p.client}</p>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-on-surface-variant/50 mb-1">FREELANCER</p>
                        <p className="font-mono-md truncate text-sm">
                          {p.freelancer === "0x0000000000000000000000000000000000000000" ? "Unassigned" : p.freelancer}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-on-surface-variant mb-2">
                      Milestone Amount: <span className="text-primary font-mono-md font-bold">{m.amount} ETH</span>
                    </div>

                    {m.reviewRequested && (
                      <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/5 text-sm space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="font-bold text-white flex items-center gap-1.5">
                            <Icon className="text-base text-tertiary">psychology</Icon> Technical Auditor Report
                          </span>
                          {m.review?.isSubmitted ? (
                            <span className="bg-tertiary/10 border border-tertiary/20 text-tertiary px-2 py-0.5 rounded text-[9px] font-bold">SUBMITTED</span>
                          ) : (
                            <span className="bg-secondary/15 border border-secondary/30 text-secondary px-2 py-0.5 rounded text-[9px] font-bold animate-pulse">PENDING AUDIT</span>
                          )}
                        </div>
                        {m.review?.isSubmitted ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-on-surface-variant/70 text-[11px]">RECOMMENDATION:</span>
                              <span className={`font-bold text-xs flex items-center gap-1.5 ${m.review.recommendedPass ? "text-tertiary" : "text-error"}`}>
                                <Icon className="text-sm">{m.review.recommendedPass ? "check_circle" : "cancel"}</Icon>
                                {m.review.recommendedPass ? "PASS (Pay Freelancer)" : "FAIL (Refund Client)"}
                              </span>
                            </div>
                            <div>
                              <span className="text-on-surface-variant/70 text-[11px] block">AUDIT FINDINGS:</span>
                              <p className="mt-1 font-mono-md text-xs text-white/90 bg-black/20 p-3 rounded-lg border border-white/5 leading-relaxed">{m.review.report}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-on-surface-variant">Awaiting audit report from platform technical staff.</p>
                        )}
                      </div>
                    )}

                    {/* Voting Tally Progress */}
                    <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/5 text-sm flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-[11px] font-semibold text-on-surface-variant/70 block">RESOLUTION VOTES CAST (2/3 MAJORITY REQUIRED)</span>
                          <div className="flex gap-6 mt-1.5 font-mono-md font-bold text-sm">
                            <span className="text-primary flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 bg-primary rounded-full inline-block"></span>
                              Votes Cast: {((m.votes?.payFreelancer || 0) + (m.votes?.refundClient || 0))} / 3 votes
                            </span>
                          </div>
                        </div>
                        {m.hasVoted && (
                          <span className="bg-primary/15 border border-primary/30 text-primary px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                            <Icon className="text-sm">done_all</Icon> YOU HAVE VOTED
                          </span>
                        )}
                      </div>
                      <div className="p-3 bg-white/5 rounded-lg border border-white/5 text-xs text-on-surface-variant flex items-start gap-2 leading-relaxed">
                        <Icon className="text-primary text-base mt-0.5">info</Icon>
                        <div>
                          <span className="font-semibold text-white">Confidential Evaluation:</span> Individual admin choices are kept confidential. The dispute will be resolved and executed only after **all 3 admins have voted**. The final distribution will follow the majority decision (2/3).
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-3 md:min-w-[240px]">
                    {m.hasVoted ? (
                      <div className="text-xs text-on-surface-variant text-center bg-white/5 p-4 rounded-xl border border-white/5 leading-relaxed flex flex-col items-center gap-2">
                        <Icon className="text-primary text-xl">done_all</Icon>
                        <span>Your vote is recorded. Awaiting all 3 arbitrators to cast votes before the case is resolved.</span>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => doResolve(p.id, m.id, true)} disabled={loading}
                          className="flex items-center justify-center gap-2 bg-tertiary-container text-on-tertiary-container font-bold py-3 px-6 rounded-lg hover:bg-tertiary transition-all active:scale-95 cursor-pointer disabled:opacity-50">
                          <Icon>payments</Icon> Vote Pay Freelancer
                        </button>
                        <button onClick={() => doResolve(p.id, m.id, false)} disabled={loading}
                          className="flex items-center justify-center gap-2 bg-error-container text-on-error-container font-bold py-3 px-6 rounded-lg hover:bg-error hover:text-on-error transition-all active:scale-95 cursor-pointer disabled:opacity-50">
                          <Icon>undo</Icon> Vote Refund Client
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Ongoing / Active Gigs Tab Content */}
      {activeTab === "active" && (
        <div className="space-y-6">
          {ongoing.length === 0 ? (
            <div className="glass-card p-12 rounded-xl text-center">
              <Icon className="text-4xl mb-3 text-on-surface-variant">folder_open</Icon>
              <p className="text-on-surface-variant">No ongoing gigs running right now.</p>
            </div>
          ) : (
            ongoing.map((p) => (
              <div key={p.id} className="glass-card rounded-xl p-8 transition-all hover:bg-white/10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono-md bg-white/5 text-white px-3 py-1 rounded-md">ID #{p.id}</span>
                      <StatusBadge label={p.state.toUpperCase()} variant={p.state.toLowerCase()} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-on-surface-variant/80">
                      <div>
                        <span className="font-semibold block mb-0.5">CLIENT</span>
                        <span className="font-mono-md">{p.client}</span>
                      </div>
                      <div>
                        <span className="font-semibold block mb-0.5">FREELANCER</span>
                        <span className="font-mono-md">
                          {p.freelancer === "0x0000000000000000000000000000000000000000" ? "Unassigned" : p.freelancer}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[200px] w-full md:w-auto">
                    <Link to={`/projects/${p.id}`} className="w-full text-center border border-white/20 hover:bg-white/5 text-white font-semibold py-2.5 px-5 rounded-lg transition-all text-sm">
                      View Escrow
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Completed / Past Archives Tab Content */}
      {activeTab === "completed" && (
        <div className="space-y-6">
          {completed.length === 0 ? (
            <div className="glass-card p-12 rounded-xl text-center">
              <Icon className="text-4xl mb-3 text-on-surface-variant">folder_open</Icon>
              <p className="text-on-surface-variant">No completed gigs yet.</p>
            </div>
          ) : (
            completed.map((p) => (
              <div key={p.id} className="glass-card rounded-xl p-8 opacity-75 transition-all hover:bg-white/10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono-md bg-white/5 text-white px-3 py-1 rounded-md">ID #{p.id}</span>
                      <StatusBadge label={p.state.toUpperCase()} variant={p.state.toLowerCase()} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-on-surface-variant/70">
                      <div>
                        <span className="font-semibold block mb-0.5">CLIENT</span>
                        <span className="font-mono-md">{p.client}</span>
                      </div>
                      <div>
                        <span className="font-semibold block mb-0.5">FREELANCER</span>
                        <span className="font-mono-md">
                          {p.freelancer === "0x0000000000000000000000000000000000000000" ? "Unassigned" : p.freelancer}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link to={`/projects/${p.id}`} className="border border-white/10 hover:bg-white/5 text-white/80 font-semibold py-2 px-4 rounded-lg text-sm transition-all text-center">
                    View Details
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Technical Audits Tab Content */}
      {activeTab === "audits" && isTechStaff && (
        <div className="space-y-6">
          {auditsPending.length === 0 ? (
            <div className="glass-card p-12 rounded-xl text-center">
              <Icon className="text-4xl mb-3 text-on-surface-variant">psychology</Icon>
              <p className="text-on-surface-variant">No pending project audits.</p>
            </div>
          ) : (
            auditsPending.map(({ project: p, milestone: m }) => (
              <div key={`${p.id}-${m.id}`} className="glass-card rounded-xl p-8 border-l-4 border-l-secondary/30 transition-all hover:bg-white/10">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="font-mono-md bg-primary/10 text-primary px-3 py-1 rounded-md">Project #{p.id}</span>
                      <span className="font-mono-md bg-secondary/10 text-secondary px-3 py-1 rounded-md">Milestone #{m.id + 1}</span>
                      <span className="bg-secondary/15 border border-secondary/30 text-secondary px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></span>
                        TECHNICAL REVIEW ACTIVE
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">"{m.description || `Milestone ${m.id + 1}`}"</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-[12px] font-semibold text-on-surface-variant/50 mb-1">CLIENT</p>
                        <p className="font-mono-md truncate text-sm">{p.client}</p>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-on-surface-variant/50 mb-1">FREELANCER</p>
                        <p className="font-mono-md truncate text-sm">{p.freelancer}</p>
                      </div>
                    </div>
                    <div className="text-sm text-on-surface-variant mb-2">
                      Milestone Amount: <span className="text-primary font-mono-md font-bold">{m.amount} ETH</span>
                    </div>

                    {m.review?.isSubmitted && (
                      <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/5 text-sm space-y-2">
                        <div className="font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2">
                          <Icon className="text-base text-tertiary">check_circle</Icon> Audit Submitted by You
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-on-surface-variant/70 text-[11px]">RECOMMENDATION:</span>
                          <span className={`font-bold text-xs flex items-center gap-1.5 ${m.review.recommendedPass ? "text-tertiary" : "text-error"}`}>
                            <Icon className="text-base">{m.review.recommendedPass ? "check_circle" : "cancel"}</Icon>
                            {m.review.recommendedPass ? "PASS (Pay Freelancer)" : "FAIL (Refund Client)"}
                          </span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant/70 text-[11px] block">YOUR FINDINGS:</span>
                          <p className="mt-1 font-mono-md text-xs text-white/90 bg-black/20 p-3 rounded-lg border border-white/5 leading-relaxed">{m.review.report}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center gap-3 md:min-w-[200px]">
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex items-center justify-center gap-2 border border-white/20 hover:bg-white/5 text-white font-semibold py-3 px-6 rounded-lg transition-all text-center text-sm"
                    >
                      <Icon className="text-sm">visibility</Icon> View Details
                    </Link>
                    {!m.review?.isSubmitted && (
                      <button
                        onClick={() => {
                          setSubmitAuditProjectId(p.id);
                          setSubmitAuditMilestoneId(m.id);
                          setAuditReport("");
                          setAuditPass(true);
                        }}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 bg-secondary text-on-secondary font-bold py-3 px-6 rounded-lg hover:bg-secondary/80 transition-all active:scale-95 cursor-pointer text-center text-sm font-semibold"
                      >
                        <Icon>rate_review</Icon> Audit Deliverables
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* My Completed Audits Tab Content */}
      {activeTab === "my-audits" && isTechStaff && (
        <div className="space-y-6">
          {myCompletedAudits.length === 0 ? (
            <div className="glass-card p-12 rounded-xl text-center">
              <Icon className="text-4xl mb-3 text-on-surface-variant">psychology</Icon>
              <p className="text-on-surface-variant">You have not submitted any technical audits yet.</p>
            </div>
          ) : (
            myCompletedAudits.map((audit, index) => (
              <div key={index} className="glass-card rounded-xl p-8 border-l-4 border-l-tertiary/30 transition-all hover:bg-white/10">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="font-mono-md bg-primary/10 text-primary px-3 py-1 rounded-md">Project #{audit.projectId}</span>
                      <span className="font-mono-md bg-secondary/10 text-secondary px-3 py-1 rounded-md">Milestone #{audit.milestoneId + 1}</span>
                      <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        audit.recommendedPass 
                          ? "bg-tertiary/10 border border-tertiary/30 text-tertiary" 
                          : "bg-error/10 border border-error/30 text-error"
                      }`}>
                        RECOMMENDED: {audit.recommendedPass ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    
                    <h4 className="text-lg font-bold text-white mb-2">"{audit.description}"</h4>
                    
                    <div className="bg-white/5 p-4 rounded-lg border border-white/5 text-sm space-y-2 mt-4">
                      <div className="font-semibold text-white">Your Submitted Report:</div>
                      <p className="text-on-surface-variant font-mono-sm whitespace-pre-wrap">{audit.report}</p>
                    </div>

                    <div className="mt-4 text-xs text-on-surface-variant/60 flex items-center gap-4">
                      <span>Project Status: <span className="text-white font-medium">{audit.projectState}</span></span>
                      <span>Transaction: <a href={`https://etherscan.io/tx/${audit.txHash}`} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono-sm">{audit.txHash.slice(0, 8)}...{audit.txHash.slice(-8)}</a></span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Submit Audit Report Modal */}
      {submitAuditProjectId !== null && submitAuditMilestoneId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-primary/5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Icon className="text-xl">psychology</Icon>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Technical Audit</h3>
                <p className="text-xs text-on-surface-variant font-medium">Project #{submitAuditProjectId} | Milestone #{submitAuditMilestoneId + 1}</p>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-[11px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
                  RECOMMENDATION
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setAuditPass(true)}
                    type="button"
                    className={`py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                      auditPass 
                        ? "bg-tertiary/10 border-tertiary text-tertiary font-bold" 
                        : "bg-white/5 border-white/10 text-on-surface-variant hover:text-white"
                    }`}
                  >
                    Pass (Pay Freelancer)
                  </button>
                  <button
                    onClick={() => setAuditPass(false)}
                    type="button"
                    className={`py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                      !auditPass 
                        ? "bg-error/10 border-error text-error font-bold" 
                        : "bg-white/5 border-white/10 text-on-surface-variant hover:text-white"
                    }`}
                  >
                    Fail (Refund Client)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] tracking-[0.05em] font-semibold text-on-surface-variant mb-2">
                  AUDIT REPORT & FEEDBACK
                </label>
                <textarea
                  value={auditReport}
                  onChange={(e) => setAuditReport(e.target.value)}
                  placeholder="Describe your technical assessment of the deliverables..."
                  rows="4"
                  className="w-full bg-white/5 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl p-3 text-sm text-white placeholder-white/30 outline-none resize-none transition-all"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="p-6 bg-white/5 border-t border-white/5 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setSubmitAuditProjectId(null);
                  setSubmitAuditMilestoneId(null);
                  setAuditReport("");
                }}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-[12px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (auditReport.trim() === "") return;
                  setLoading(true);
                  try {
                    await submitAuditReport(submitAuditProjectId, submitAuditMilestoneId, auditReport.trim(), auditPass);
                    showToast("Technical audit report successfully submitted!");
                    setRefresh((r) => r + 1);
                    setSubmitAuditProjectId(null);
                    setSubmitAuditMilestoneId(null);
                    setAuditReport("");
                  } catch (e) {
                    showToast("Submission failed", "error");
                  }
                  setLoading(false);
                }}
                disabled={loading || auditReport.trim() === ""}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-white text-[12px] font-semibold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-primary/20 border border-primary/30 cursor-pointer"
              >
                {loading ? "Submitting..." : "Submit Audit"}
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
