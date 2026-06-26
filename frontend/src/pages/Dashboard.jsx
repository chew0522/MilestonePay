import { useState, useEffect } from "react";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard() {
  const { account: address, isConnecting, connect } = useWallet();
  const isConnected = !!address;
  const { contract, getProject, getUserProjectIds } = useContract();
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState("client"); // "client" or "freelancer"

  // Role checks
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTechStaff, setIsTechStaff] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

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

  useEffect(() => {
    async function load() {
      if (checkingRole || isAdmin || isTechStaff) return;
      const ids = await getUserProjectIds();
      const projectsData = [];
      for (const id of ids) {
        const p = await getProject(id);
        if (p) projectsData.push({ id, ...p });
      }
      setProjects(projectsData);
    }
    if (isConnected && !checkingRole) load();
  }, [isConnected, checkingRole, isAdmin, isTechStaff, getUserProjectIds, getProject]);

  if (checkingRole && isConnected) {
    return (
      <main className="max-w-[1200px] mx-auto px-4 py-24 text-center">
        <p className="text-on-surface-variant animate-pulse">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="relative z-10 flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-6">
      {/* Hero */}
      <section className="py-16 md:py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-[48px] leading-[56px] tracking-[-0.02em] font-bold text-on-background mb-6">
            {(isAdmin || isTechStaff) ? "Admin Control Panel" : "Blockchain Freelance Payments"}
          </h1>
          <p className="text-body-md text-on-surface-variant mb-10 text-lg md:text-xl">
            {(isAdmin || isTechStaff)
              ? "You are logged in with administrative privileges. Manage platform disputes and technical audits."
              : "Smart contract-powered escrows that ensure trust between clients and freelancers."}
          </p>
          <div className="flex justify-center gap-4">
            {(isAdmin || isTechStaff) ? (
              <Link to="/admin" className="rainbow-btn px-8 py-4 rounded-xl font-bold flex items-center gap-2 text-on-primary">
                <Icon>gavel</Icon> Go to Admin Control Center
              </Link>
            ) : (
              <Link to="/projects/new" className="rainbow-btn px-8 py-4 rounded-xl font-bold flex items-center gap-2 text-on-primary">
                <Icon>add_circle</Icon> Create New Project
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
        {[
          { icon: "lock", title: "Secure Escrow", desc: "Funds held in a smart contract, only released when milestones are approved.", color: "text-primary-container bg-primary-container/20" },
          { icon: "assignment", title: "Milestone Tracking", desc: "Break projects into milestones with automatic payment on approval.", color: "text-tertiary bg-tertiary/20" },
          { icon: "balance", title: "Dispute Resolution", desc: "Neutral arbitration when things go off-track, protecting both parties.", color: "text-secondary bg-secondary/20" },
        ].map((f) => (
          <div key={f.title} className="glass-card p-8 rounded-xl group hover:bg-white/10 transition-all duration-300">
            <div className={`w-12 h-12 rounded-lg ${f.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
              <Icon className="text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</Icon>
            </div>
            <h3 className="text-[24px] leading-[32px] font-bold mb-2">{f.title}</h3>
            <p className="text-on-surface-variant/80">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Projects */}
      {!(isAdmin || isTechStaff) && (
        <section className="mb-20">
          <div className="flex items-center justify-between mb-8 border-b border-white/10">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab("client")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "client" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>payments</Icon> Projects I'm Funding
              </button>
              <button
                onClick={() => setActiveTab("freelancer")}
                className={`pb-4 text-xl md:text-[24px] font-bold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "freelancer" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-on-surface-variant hover:text-white"
                }`}
              >
                <Icon>work</Icon> Gigs I'm Working On
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {!isConnected ? (
              <div className="border-2 border-dashed border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 transition-opacity">
                <Icon className="text-4xl mb-3 text-on-surface-variant">account_balance_wallet</Icon>
                <p className="text-body-md mb-2">Connect your wallet to view your projects</p>
                <button onClick={connect} disabled={isConnecting} className="rainbow-btn px-6 py-3 rounded-xl font-bold text-on-primary">
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              </div>
            ) : projects.filter(p => (p.state === "Active" || p.state === "Disputed") && (activeTab === "client" ? p.client.toLowerCase() === address.toLowerCase() : p.freelancer.toLowerCase() === address.toLowerCase())).length === 0 ? (
              <div className="border-2 border-dashed border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <Icon className="text-4xl mb-3 text-on-surface-variant">folder_open</Icon>
                <p className="text-body-md mb-2">No active projects found in this tab.</p>
                {activeTab === "client" ? (
                  <Link to="/projects/new" className="rainbow-btn px-6 py-3 rounded-xl font-bold text-on-primary">
                    Create Your First Project
                  </Link>
                ) : (
                  <Link to="/projects" className="rainbow-btn px-6 py-3 rounded-xl font-bold text-on-primary">
                    Browse Gig Marketplace
                  </Link>
                )}
              </div>
            ) : (
              projects
                .filter(p => p.state === "Active" || p.state === "Disputed")
                .filter(p => activeTab === "client" ? p.client.toLowerCase() === address.toLowerCase() : p.freelancer.toLowerCase() === address.toLowerCase())
                .map((p) => {
                  const isClientRole = address?.toLowerCase() === p.client.toLowerCase();
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`} className="glass-card p-6 rounded-2xl flex flex-wrap md:flex-nowrap items-center gap-6 group hover:border-primary/40 transition-colors block">
                      <div className="flex-shrink-0">
                        <div className="w-14 h-14 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary-container">
                          <Icon className="text-3xl">token</Icon>
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
                          <span className="flex items-center gap-1">
                            <span className="text-primary/50 text-[10px]">FREELANCER</span> 
                            {p.freelancer === "0x0000000000000000000000000000000000000000" 
                              ? "Unassigned" 
                              : `${p.freelancer.slice(0, 6)}...${p.freelancer.slice(-4)}`}
                          </span>
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
                })
            )}
          </div>
        </section>
      )}
    </main>
  );
}
