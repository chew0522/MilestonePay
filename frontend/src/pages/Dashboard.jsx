import { useState, useEffect } from "react";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard() {
  const { account: address, isConnecting, connect } = useWallet();
  const isConnected = !!address;
  const { getProject, getUserProjectIds } = useContract();
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    async function load() {
      const ids = await getUserProjectIds();
      const projectsData = [];
      for (const id of ids) {
        const p = await getProject(id);
        if (p) projectsData.push({ id, ...p });
      }
      setProjects(projectsData);
    }
    if (isConnected) load();
  }, [isConnected, getUserProjectIds, getProject]);

  return (
    <main className="relative z-10 flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-6">
      {/* Hero */}
      <section className="py-16 md:py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-[48px] leading-[56px] tracking-[-0.02em] font-bold text-on-background mb-6">
            Blockchain <span className="text-primary-container">Freelance Payments</span>
          </h1>
          <p className="text-body-md text-on-surface-variant mb-10 text-lg md:text-xl">
            Smart contract-powered escrows that ensure trust between clients and freelancers.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/projects/new" className="rainbow-btn px-8 py-4 rounded-xl font-bold flex items-center gap-2 text-on-primary">
              <Icon>add_circle</Icon> Create New Project
            </Link>
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
      <section className="mb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-[32px] leading-[40px] tracking-[-0.01em] font-bold">My Projects</h2>
            <p className="text-on-surface-variant text-sm">Projects where you are client or freelancer</p>
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
          ) : projects.length === 0 ? (
            <div className="border-2 border-dashed border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <Icon className="text-4xl mb-3 text-on-surface-variant">add_circle</Icon>
              <p className="text-body-md mb-2">No projects yet</p>
              <Link to="/projects/new" className="rainbow-btn px-6 py-3 rounded-xl font-bold text-on-primary">
                Create Your First Project
              </Link>
            </div>
          ) : (
            projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="glass-card p-6 rounded-2xl flex flex-wrap md:flex-nowrap items-center gap-6 group hover:border-primary/40 transition-colors block">
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container-highest flex items-center justify-center text-primary-container">
                    <Icon className="text-3xl">token</Icon>
                  </div>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-bold text-lg">Project #{p.id}</h4>
                    <StatusBadge label={p.state} variant={p.state.toLowerCase()} />
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-mono-md text-on-surface-variant text-xs">
                    <span className="flex items-center gap-1"><span className="text-primary/50 text-[10px]">ID</span> #{p.id}</span>
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
            ))
          )}
        </div>
      </section>
    </main>
  );
}
