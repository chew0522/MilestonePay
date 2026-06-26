import { useState, useEffect } from "react";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import StatusBadge from "../components/StatusBadge";

export default function CompletedProjects() {
  const { account: address, isConnecting, connect } = useWallet();
  const isConnected = !!address;
  const { contract, getProject, getMilestone } = useContract();
  
  // Role checks
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTechStaff, setIsTechStaff] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  // Tab state: "all" (admin view), "audits" (auditor view), "gigs" (user view)
  const [activeTab, setActiveTab] = useState("gigs");

  // Data states
  const [completedList, setCompletedList] = useState([]);
  const [myAudits, setMyAudits] = useState([]);
  const [userGigs, setUserGigs] = useState([]);

  // 1. Check roles on wallet connection
  useEffect(() => {
    async function checkRoles() {
      if (contract && address) {
        try {
          const roleHash = await contract.ARBITRATOR_ROLE();
          const hasRole = await contract.hasRole(roleHash, address);
          setIsAdmin(hasRole);

          const techRoleHash = await contract.TECHNICAL_STAFF_ROLE();
          const hasTechRole = await contract.hasRole(techRoleHash, address);
          setIsTechStaff(hasTechRole);
        } catch (e) {
          console.error("Failed to check roles:", e);
          setIsAdmin(false);
          setIsTechStaff(false);
        }
      } else {
        setIsAdmin(false);
        setIsTechStaff(false);
      }
      setCheckingRole(false);
    }
    checkRoles();
  }, [contract, address]);

  // 2. Set default active tab based on role
  useEffect(() => {
    if (!checkingRole) {
      if (isAdmin) {
        setActiveTab("all");
      } else if (isTechStaff) {
        setActiveTab("audits");
      } else {
        setActiveTab("gigs");
      }
    }
  }, [checkingRole, isAdmin, isTechStaff]);

  // 3. Load data
  useEffect(() => {
    async function load() {
      if (!contract || !address || checkingRole) return;
      setLoadingData(true);
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
                ms.push({ id: i, ...m });
              }
            }
            projectsList.push({ id, ...p, milestones: ms });
          }
        }

        // 1. All completed/cancelled projects on the platform (Admin View)
        const allCompleted = projectsList.filter(p => p.state === "Completed" || p.state === "Cancelled");
        setCompletedList(allCompleted);

        // 2. User's completed/cancelled projects (User View)
        const userProjectIds = await contract.getUserProjects(address);
        const userIdsSet = new Set(userProjectIds.map(id => Number(id)));
        const userComp = allCompleted.filter(p => userIdsSet.has(p.id));
        setUserGigs(userComp);

        // 3. Auditor's resolved milestones (Auditor View)
        const subReviewEvs = await contract.queryFilter(contract.filters.TechnicalReviewSubmitted());
        const auditorAudits = [];
        
        for (const ev of subReviewEvs) {
          if (address && ev.args.staff.toLowerCase() === address.toLowerCase()) {
            const pId = Number(ev.args.projectId);
            const mId = Number(ev.args.milestoneId);
            const projObj = projectsList.find(p => p.id === pId);
            const mileObj = projObj ? projObj.milestones.find(m => m.id === mId) : null;

            auditorAudits.push({
              projectId: pId,
              milestoneId: mId,
              description: mileObj ? mileObj.description : `Milestone #${mId + 1}`,
              report: ev.args.report,
              recommendedPass: ev.args.recommendedPass,
              txHash: ev.transactionHash,
              blockNumber: Number(ev.blockNumber),
              projectState: projObj ? projObj.state : "Unknown",
              totalAmount: projObj ? projObj.totalAmount : "0"
            });
          }
        }
        auditorAudits.sort((a, b) => b.blockNumber - a.blockNumber);
        setMyAudits(auditorAudits);
      } catch (e) {
        console.error("Error loading completed history data:", e);
      } finally {
        setLoadingData(false);
      }
    }
    if (isConnected) load();
  }, [isConnected, contract, address, checkingRole, getProject, getMilestone]);

  // Loading states
  if (checkingRole) {
    return (
      <main className="max-w-[1200px] mx-auto px-4 py-24 text-center">
        <p className="text-on-surface-variant animate-pulse">Verifying credentials...</p>
      </main>
    );
  }

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-6 py-12"
      style={{ background: "radial-gradient(circle at top right, #192029 0%, #0d141d 100%)" }}
    >
      <header className="mb-12">
        <h1 className="text-[48px] leading-[56px] tracking-[-0.02em] font-bold mb-2 text-primary">Project History</h1>
        <p className="text-body-md text-on-surface-variant max-w-2xl">
          Review past completed or cancelled smart contract escrows.
        </p>
      </header>

      {!isConnected ? (
        <div className="glass-card p-12 rounded-xl text-center flex flex-col items-center justify-center">
          <Icon className="text-5xl mb-4 text-on-surface-variant">account_balance_wallet</Icon>
          <p className="text-on-surface-variant mb-4">Connect your wallet to view your history</p>
          <button onClick={connect} className="rainbow-btn px-6 py-2 rounded-full font-semibold text-on-primary">
            Connect Wallet
          </button>
        </div>
      ) : loadingData ? (
        <main className="max-w-[1200px] mx-auto py-24 text-center">
          <p className="text-on-surface-variant animate-pulse">Loading history data...</p>
        </main>
      ) : (
        <div className="space-y-8">
          {/* Dynamic Tabs based on roles */}
          {(isAdmin || isTechStaff) && (
            <div className="flex gap-6 border-b border-white/10 pb-2">
              {isAdmin && (
                <button
                  onClick={() => setActiveTab("all")}
                  className={`pb-3 text-lg font-bold border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === "all"
                      ? "border-primary text-primary"
                      : "border-transparent text-on-surface-variant hover:text-white"
                  }`}
                >
                  <Icon>dashboard</Icon> All Contracts ({completedList.length})
                </button>
              )}
              {isTechStaff && (
                <button
                  onClick={() => setActiveTab("audits")}
                  className={`pb-3 text-lg font-bold border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === "audits"
                      ? "border-primary text-primary"
                      : "border-transparent text-on-surface-variant hover:text-white"
                  }`}
                >
                  <Icon>psychology</Icon> My Audits ({myAudits.length})
                </button>
              )}
              <button
                onClick={() => setActiveTab("gigs")}
                className={`pb-3 text-lg font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "gigs"
                    ? "border-primary text-primary"
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>work</Icon> My Gigs ({userGigs.length})
              </button>
            </div>
          )}

          {/* All Contracts (Admin View) */}
          {activeTab === "all" && isAdmin && (
            completedList.length === 0 ? (
              <div className="glass-card p-12 rounded-xl text-center">
                <Icon className="text-4xl mb-3 text-on-surface-variant">history_toggle_off</Icon>
                <p className="text-on-surface-variant">No completed or cancelled projects found on the platform.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedList.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="glass-card p-6 rounded-2xl flex flex-wrap md:flex-nowrap items-center gap-6 group hover:border-primary/40 transition-colors block">
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary-container">
                        <Icon className="text-3xl">archive</Icon>
                      </div>
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h4 className="font-bold text-lg">Project #{p.id}</h4>
                        <StatusBadge label={p.state} variant={p.state.toLowerCase()} />
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-mono-md text-on-surface-variant text-xs">
                        <span className="flex items-center gap-1"><span className="text-primary/50 text-[10px]">CLIENT</span> {p.client.slice(0, 6)}...{p.client.slice(-4)}</span>
                        <span className="flex items-center gap-1"><span className="text-primary/50 text-[10px]">FREELANCER</span> {p.freelancer.slice(0, 6)}...{p.freelancer.slice(-4)}</span>
                      </div>
                    </div>
                    <div className="w-full md:w-48">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-on-surface-variant">Progress</span>
                        <span className="text-primary">{p.completedMilestones}/{p.milestoneCount}</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div className="h-full bg-primary-container" style={{ width: `${(p.completedMilestones / p.milestoneCount) * 100}%` }}></div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right min-w-[100px]">
                      <div className="text-mono-md text-xl text-primary">{p.totalAmount} ETH</div>
                    </div>
                    <div className="flex-shrink-0">
                      <Icon className="text-on-surface-variant">chevron_right</Icon>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {/* My Audits (Auditor View) */}
          {activeTab === "audits" && isTechStaff && (
            myAudits.length === 0 ? (
              <div className="glass-card p-12 rounded-xl text-center">
                <Icon className="text-4xl mb-3 text-on-surface-variant">psychology</Icon>
                <p className="text-on-surface-variant">You have not resolved or audited any milestones yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {myAudits.map((audit, index) => (
                  <div key={index} className="glass-card rounded-xl p-8 border-l-4 border-l-tertiary/30 transition-all hover:bg-white/10">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div className="flex-grow">
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
                          <div className="font-semibold text-white">Your Submitted Assessment:</div>
                          <p className="text-on-surface-variant font-mono-sm whitespace-pre-wrap">{audit.report}</p>
                        </div>

                        <div className="mt-4 text-xs text-on-surface-variant/60 flex items-center gap-4">
                          <span>Project Status: <span className="text-white font-medium">{audit.projectState}</span></span>
                          <span>Transaction: <a href={`https://etherscan.io/tx/${audit.txHash}`} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono-sm">{audit.txHash.slice(0, 8)}...{audit.txHash.slice(-8)}</a></span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center md:min-w-[120px]">
                        <Link to={`/projects/${audit.projectId}`} className="w-full text-center border border-white/20 hover:bg-white/5 text-white font-semibold py-2.5 px-5 rounded-lg transition-all text-sm">
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* My Gigs (User View) */}
          {activeTab === "gigs" && (
            userGigs.length === 0 ? (
              <div className="glass-card p-12 rounded-xl text-center">
                <Icon className="text-5xl mb-4 text-on-surface-variant">history_toggle_off</Icon>
                <p className="text-on-surface-variant">No completed or cancelled projects found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {userGigs.map((p) => {
                  const isClientRole = address.toLowerCase() === p.client.toLowerCase();
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`} className="glass-card p-6 rounded-2xl flex flex-wrap md:flex-nowrap items-center gap-6 group hover:border-primary/40 transition-colors block">
                      <div className="flex-shrink-0">
                        <div className="w-14 h-14 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary-container">
                          <Icon className="text-3xl">archive</Icon>
                        </div>
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-1.5">
                          <h4 className="font-bold text-lg">Project #{p.id}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isClientRole 
                              ? "bg-primary/20 text-primary border border-primary/20" 
                              : "bg-tertiary/20 text-tertiary border border-tertiary/20"
                          }`}>
                            {isClientRole ? "CLIENT" : "FREELANCER"}
                          </span>
                          <StatusBadge label={p.state} variant={p.state.toLowerCase()} />
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-mono-md text-on-surface-variant text-xs">
                          <span className="flex items-center gap-1"><span className="text-primary/50 text-[10px]">CLIENT</span> {p.client.slice(0, 6)}...{p.client.slice(-4)}</span>
                          <span className="flex items-center gap-1"><span className="text-primary/50 text-[10px]">FREELANCER</span> {p.freelancer.slice(0, 6)}...{p.freelancer.slice(-4)}</span>
                        </div>
                      </div>
                      <div className="w-full md:w-48">
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-on-surface-variant">Progress</span>
                          <span className="text-primary">{p.completedMilestones}/{p.milestoneCount}</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                          <div className="h-full bg-primary-container" style={{ width: `${(p.completedMilestones / p.milestoneCount) * 100}%` }}></div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right min-w-[100px]">
                        <div className="text-mono-md text-xl text-primary">{p.totalAmount} ETH</div>
                      </div>
                      <div className="flex-shrink-0">
                        <Icon className="text-on-surface-variant">chevron_right</Icon>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </main>
  );
}
