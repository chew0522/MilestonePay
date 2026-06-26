import { useState, useEffect } from "react";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";

export default function ProjectsList() {
  const { account, isConnecting, connect } = useWallet();
  const { contract, getProject, claimProject, loading } = useContract();
  const [openProjects, setOpenProjects] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  useEffect(() => {
    async function load() {
      if (!contract) return;
      try {
        const count = await contract.nextProjectId();
        const list = [];
        for (let id = 0; id < Number(count); id++) {
          const p = await getProject(id);
          if (p && p.state === "Active") {
            const isOpen = p.freelancer === "0x0000000000000000000000000000000000000000";
            const isAssignedToMe = account && p.freelancer.toLowerCase() === account.toLowerCase();
            if (isOpen || isAssignedToMe) {
              list.push({ id, ...p });
            }
          }
        }
        setOpenProjects(list);
      } catch (e) {
        console.error("Error loading open projects:", e);
      }
    }
    load();
  }, [contract, getProject, refresh, account]);

  const handleClaim = async (projectId) => {
    try {
      await claimProject(projectId);
      showToast("Project successfully claimed!");
      setRefresh((r) => r + 1);
    } catch (e) {
      showToast("Failed to claim project", "error");
    }
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-6 py-12"
      style={{ background: "radial-gradient(circle at top right, #192029 0%, #0d141d 100%)" }}
    >
      <header className="mb-12">
        <h1 className="text-[48px] leading-[56px] tracking-[-0.02em] font-bold mb-2 text-primary">Gig Marketplace</h1>
        <p className="text-body-md text-on-surface-variant max-w-2xl">
          Browse open projects, view their milestones, and claim them to start working.
        </p>
      </header>

      {!account ? (
        <div className="glass-card p-12 rounded-xl text-center flex flex-col items-center justify-center">
          <Icon className="text-5xl mb-4 text-on-surface-variant">account_balance_wallet</Icon>
          <p className="text-on-surface-variant mb-4">Please connect your wallet to browse and claim gigs</p>
          <button onClick={connect} disabled={isConnecting} className="rainbow-btn px-6 py-2 rounded-full font-semibold text-on-primary">
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      ) : openProjects.length === 0 ? (
        <div className="glass-card p-12 rounded-xl text-center">
          <Icon className="text-5xl mb-4 text-on-surface-variant">folder_open</Icon>
          <p className="text-on-surface-variant">No open gigs available right now. Check back later!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {openProjects.map((p) => {
            const isMyProject = account && account.toLowerCase() === p.client.toLowerCase();
            const isAssignedToMe = account && p.freelancer.toLowerCase() === account.toLowerCase();
            return (
              <div key={p.id} className="glass-card rounded-2xl p-6 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-2 items-center">
                      <span className="font-mono-md bg-primary/10 text-primary px-3 py-1 rounded-md text-xs">ID #{p.id}</span>
                      {isAssignedToMe && (
                        <span className="bg-tertiary/25 border border-tertiary/40 text-tertiary px-2 py-0.5 rounded-full text-[10px] font-bold">ASSIGNED TO YOU</span>
                      )}
                    </div>
                    <span className="text-[24px] font-bold text-tertiary">{p.totalAmount} ETH</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Gig #{p.id}</h3>
                  <div className="space-y-2 text-sm text-on-surface-variant/80 mb-6">
                    <p className="flex items-center gap-2">
                      <Icon className="text-xs">person</Icon> 
                      <span>Client: {p.client.slice(0, 6)}...{p.client.slice(-4)}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Icon className="text-xs">assignment</Icon> 
                      <span>Milestones: {p.milestoneCount} milestones</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 mt-auto">
                  <Link to={`/projects/${p.id}`} className="flex-1 text-center border border-white/20 py-3 rounded-xl font-semibold hover:bg-white/5 transition-colors">
                    Details
                  </Link>
                  {isAssignedToMe ? (
                    <Link to={`/projects/${p.id}`} className="flex-1 bg-tertiary/20 text-tertiary border border-tertiary/30 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-tertiary/30 transition-colors">
                      <Icon>play_arrow</Icon> Start Work
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleClaim(p.id)}
                      disabled={loading || isMyProject}
                      className="flex-1 glow-button py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isMyProject ? "You cannot claim your own project" : ""}
                    >
                      <Icon>pan_tool</Icon> Claim Gig
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
