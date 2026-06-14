import { useState, useEffect } from "react";
import { useContract } from "../useContract";
import { useWallet } from "../WalletContext";
import Icon from "../components/Icon";

export default function AdminDispute() {
  const { account } = useWallet();
  const { contract, getProject, getUserProjectIds, getMilestone, resolveDispute } = useContract();
  const [disputedProjects, setDisputedProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    async function load() {
      if (!contract) return;
      const ids = await getUserProjectIds();
      const disputed = [];
      for (const id of ids) {
        const p = await getProject(id);
        if (p && p.state === "Disputed") {
          disputed.push({ id, ...p });
        }
      }
      setDisputedProjects(disputed);
    }
    load();
  }, [contract, getUserProjectIds, getProject, refresh]);

  const doResolve = async (projectId, payFreelancer) => {
    setLoading(true);
    try {
      await resolveDispute(projectId, payFreelancer);
      setRefresh((r) => r + 1);
    } catch (e) {
      alert("Transaction failed");
    }
    setLoading(false);
  };

  return (
    <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-12"
      style={{ background: "radial-gradient(circle at top right, #192029 0%, #0d141d 100%)" }}
    >
      <header className="mb-12">
        <h1 className="text-[48px] leading-[56px] tracking-[-0.02em] font-bold mb-2 text-primary">Dispute Resolution Center</h1>
        <p className="text-body-md text-on-surface-variant max-w-2xl">Resolve smart contract escrow disputes.</p>
      </header>

      {disputedProjects.length === 0 ? (
        <div className="glass-card p-12 rounded-xl text-center">
          <Icon className="text-4xl mb-3 text-on-surface-variant">gavel</Icon>
          <p className="text-on-surface-variant">No active disputes</p>
        </div>
      ) : (
        <div className="space-y-6">
          {disputedProjects.map((p) => (
            <div key={p.id} className="glass-card rounded-xl p-8 border-l-4 border-l-primary/30 transition-all hover:bg-white/10">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="font-mono-md bg-primary/10 text-primary px-3 py-1 rounded-md">ID #{p.id}</span>
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-error border border-error/30 bg-error/5 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-error rounded-full animate-pulse"></span>
                      DISPUTED
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[12px] font-semibold text-on-surface-variant/50 mb-1">CLIENT</p>
                      <p className="font-mono-md truncate">{p.client}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-on-surface-variant/50 mb-1">FREELANCER</p>
                      <p className="font-mono-md truncate">{p.freelancer}</p>
                    </div>
                  </div>
                  <div className="text-sm text-on-surface-variant mb-2">
                    Amount locked: <span className="text-primary font-mono-md">{p.totalAmount} ETH</span>
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-3 md:min-w-[240px]">
                  <button onClick={() => doResolve(p.id, true)} disabled={loading}
                    className="flex items-center justify-center gap-2 bg-tertiary-container text-on-tertiary-container font-bold py-3 px-6 rounded-lg hover:bg-tertiary transition-all active:scale-95">
                    <Icon>payments</Icon> Pay Freelancer
                  </button>
                  <button onClick={() => doResolve(p.id, false)} disabled={loading}
                    className="flex items-center justify-center gap-2 bg-error-container text-on-error-container font-bold py-3 px-6 rounded-lg hover:bg-error hover:text-on-error transition-all active:scale-95">
                    <Icon>undo</Icon> Refund Client
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
