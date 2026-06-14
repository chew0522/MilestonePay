import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useContract } from "../useContract";
import Icon from "../components/Icon";

export default function CreateProject() {
  const [milestoneCount, setMilestoneCount] = useState(3);
  const [percentages, setPercentages] = useState([30, 40, 30]);
  const [descriptions, setDescriptions] = useState([
    "Project Initiation & Research",
    "Core Smart Contract Logic",
    "Final Integration & Testing",
  ]);
  const [freelancer, setFreelancer] = useState("");
  const [deposit, setDeposit] = useState("");
  const [txPending, setTxPending] = useState(false);
  const { createProject } = useContract();
  const navigate = useNavigate();

  const totalPct = percentages.reduce((a, b) => a + b, 0);

  const handleCountChange = (e) => {
    const count = Math.min(Math.max(parseInt(e.target.value) || 1, 1), 20);
    setMilestoneCount(count);
    setPercentages((prev) => {
      if (count > prev.length) return Array(count).fill(Math.floor(100 / count));
      return prev.slice(0, count);
    });
    setDescriptions((prev) => {
      const newDesc = [...prev];
      while (newDesc.length < count) newDesc.push("");
      return newDesc.slice(0, count);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!freelancer || !deposit || totalPct !== 100) return;
    setTxPending(true);
    try {
      await createProject(freelancer, milestoneCount, descriptions, percentages, deposit);
      navigate("/");
    } catch (err) {
      alert("Transaction failed or was rejected.");
    }
    setTxPending(false);
  };

  return (
    <main className="flex-grow flex items-center justify-center py-12 px-4"
      style={{ background: "radial-gradient(circle at top right, #192029 0%, #0d141d 100%)" }}
    >
      <div className="w-full max-w-2xl">
        <div className="glass-card rounded-xl p-8 md:p-12">
          <div className="mb-10 text-center">
            <h1 className="text-[32px] leading-[40px] tracking-[-0.01em] font-bold text-white mb-2">Create New Project</h1>
            <p className="text-body-md text-on-surface-variant/80">Deploy a smart contract escrow with defined milestones.</p>
          </div>

          <form className="space-y-8" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Freelancer Wallet Address</label>
              <div className="relative">
                <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">account_balance_wallet</Icon>
                <input className="glass-input w-full rounded-lg pl-12 pr-4 py-3 font-mono-md text-white placeholder:text-on-surface-variant/30"
                  placeholder="0x..." type="text" value={freelancer} onChange={(e) => setFreelancer(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Number of Milestones</label>
                <input className="glass-input w-full rounded-lg px-4 py-3" type="number" min="1" max="20" value={milestoneCount} onChange={handleCountChange} />
              </div>
              <div className="space-y-2">
                <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Total Deposit (ETH)</label>
                <div className="relative">
                  <input className="glass-input w-full rounded-lg px-4 py-3" placeholder="0.00" step="0.01" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-primary">ETH</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Milestone Allocation</h3>
                <span className={`font-mono-md ${totalPct === 100 ? "text-tertiary" : "text-error"}`}>Total: {totalPct}%</span>
              </div>
              <div className="space-y-3">
                {Array.from({ length: milestoneCount }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <div className="flex-grow">
                      <input className="glass-input w-full rounded-lg px-4 py-3 text-sm text-white"
                        placeholder={`Description`} type="text"
                        value={descriptions[i] || ""} onChange={(e) => {
                          const d = [...descriptions]; d[i] = e.target.value; setDescriptions(d);
                        }} />
                    </div>
                    <div className="w-24 relative">
                      <input className="glass-input w-full rounded-lg px-3 py-3 text-sm text-white text-right"
                        placeholder="%" type="number" value={percentages[i] || 0} onChange={(e) => {
                          const p = [...percentages]; p[i] = parseInt(e.target.value) || 0; setPercentages(p);
                        }} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-on-surface-variant/40">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button type="submit"
              className="glow-button w-full py-4 rounded-xl text-[24px] leading-[32px] font-bold text-white flex items-center justify-center gap-3"
              disabled={totalPct !== 100 || !freelancer || !deposit || txPending}
              style={{ opacity: totalPct !== 100 || !freelancer || !deposit || txPending ? 0.5 : 1 }}>
              {txPending ? (
                <span className="animate-pulse">Processing Transaction...</span>
              ) : (
                <><Icon>add_circle</Icon> Deposit & Create</>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
