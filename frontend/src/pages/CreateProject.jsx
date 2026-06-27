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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [txPending, setTxPending] = useState(false);
  const { createProject } = useContract();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

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

  const handleAddMilestone = () => {
    if (milestoneCount >= 20) {
      showToast("Maximum of 20 milestones reached.", "error");
      return;
    }
    setMilestoneCount((prev) => prev + 1);
    setPercentages((prev) => [...prev, 0]);
    setDescriptions((prev) => [...prev, ""]);
  };

  const handleDeleteMilestone = (idx) => {
    if (milestoneCount <= 1) {
      showToast("You must have at least 1 milestone.", "error");
      return;
    }
    setMilestoneCount((prev) => prev - 1);
    setPercentages((prev) => prev.filter((_, i) => i !== idx));
    setDescriptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAiGenerate = async () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      showToast("Gemini API Key is missing. Please configure VITE_GEMINI_API_KEY in your .env.local file.", "error");
      return;
    }
    setAiLoading(true);
    try {
      const prompt = `Analyze the project title: "${title}" and job description: "${description}".
Break it down into a logical milestone structure for a smart contract escrow.
You must return a JSON object containing a "milestones" array.
Each object in the array must contain:
1. "description" (string, max 60 chars) - the name and summary of the milestone deliverables.
2. "percentage" (integer) - the percentage of budget allocated to this milestone.

Constraints:
- The sum of all milestone percentages MUST be exactly 100.
- The number of milestones should be between 2 and 5 (depending on the scope).
- Each percentage must be a positive integer greater than 0.

Example JSON output structure:
{
  "milestones": [
    { "description": "Milestone 1: UI/UX Wireframes & Design System", "percentage": 30 },
    { "description": "Milestone 2: Core Development & Integration", "percentage": 50 },
    { "description": "Milestone 3: Deployment, Testing & Handover", "percentage": 20 }
  ]
}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        let errMsg = "Failed to contact Gemini API";
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMsg = `Gemini API Error: ${errData.error.message}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonText) {
        throw new Error("Invalid or empty response format received from Gemini");
      }
      const parsed = JSON.parse(jsonText);

      if (Array.isArray(parsed.milestones) && parsed.milestones.length > 0) {
        const sum = parsed.milestones.reduce((acc, m) => acc + (parseInt(m.percentage) || 0), 0);
        if (sum !== 100) {
          const diff = 100 - sum;
          parsed.milestones[parsed.milestones.length - 1].percentage = 
            (parseInt(parsed.milestones[parsed.milestones.length - 1].percentage) || 0) + diff;
        }

        setMilestoneCount(parsed.milestones.length);
        setPercentages(parsed.milestones.map(m => parseInt(m.percentage) || 0));
        setDescriptions(parsed.milestones.map(m => m.description));
        showToast("Milestones successfully generated by Gemini AI!", "success");
      } else {
        throw new Error("Invalid format received from Gemini");
      }
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to generate milestones. Check your API key or network connection.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !deposit || totalPct !== 100) return;

    const deadlineTimestamp = deadlineDate
      ? Math.floor(new Date(deadlineDate).getTime() / 1000)
      : 0;

    if (deadlineTimestamp > 0 && deadlineTimestamp <= Math.floor(Date.now() / 1000)) {
      showToast("Deadline must be in the future.", "error");
      return;
    }

    setTxPending(true);
    try {
      const freelancerAddress = freelancer.trim() === "" 
        ? "0x0000000000000000000000000000000000000000" 
        : freelancer.trim();
      await createProject(freelancerAddress, title.trim(), description.trim(), milestoneCount, descriptions, percentages, deposit, deadlineTimestamp);
      navigate("/");
    } catch (err) {
      showToast("Transaction failed or was rejected.", "error");
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
              <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Freelancer Wallet Address (Optional)</label>
              <div className="relative">
                <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">account_balance_wallet</Icon>
                <input className="glass-input w-full rounded-lg pl-12 pr-4 py-3 font-mono-md text-white placeholder:text-on-surface-variant/30"
                  placeholder="0x..." type="text" value={freelancer} onChange={(e) => setFreelancer(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Project Title</label>
              <input className="glass-input w-full rounded-lg px-4 py-3 text-white placeholder:text-on-surface-variant/30"
                placeholder="e.g. Website Redesign" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Job Description</label>
              <textarea className="glass-input w-full rounded-lg px-4 py-3 text-white placeholder:text-on-surface-variant/30 resize-none font-sans"
                placeholder="Describe the scope of work for this contract..." rows="3" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Project Deadline</label>
              <input className="glass-input w-full rounded-lg px-4 py-3 text-white placeholder:text-on-surface-variant/30 [color-scheme:dark]"
                type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Number of Milestones</label>
                <input className="glass-input w-full rounded-lg px-4 py-3 opacity-60 cursor-not-allowed" type="number" value={milestoneCount} disabled />
              </div>
              <div className="space-y-2">
                <label className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Total Deposit (ETH)</label>
                <div className="relative">
                  <input className="glass-input w-full rounded-lg px-4 py-3" placeholder="0.00" step="0.01" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-primary">ETH</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-white/5 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Milestones Configuration</h3>
                  <p className="text-xs text-on-surface-variant/70">Break down the project work and allocate budget percentages.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiLoading || !title.trim() || !description.trim()}
                  className="px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary hover:text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto self-end"
                  title={(!title.trim() || !description.trim()) ? "Fill in Project Title and Job Description to use AI suggestion" : ""}
                >
                  <Icon className={`text-sm ${aiLoading ? "animate-spin" : ""}`}>
                    {aiLoading ? "sync" : "psychology"}
                  </Icon>
                  {aiLoading ? "Analyzing..." : "Suggest Milestones with Gemini"}
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant">Milestone Allocation</h3>
                <span className={`font-mono-md ${totalPct === 100 ? "text-tertiary" : "text-error"}`}>Total: {totalPct}%</span>
              </div>
              <div className="space-y-3">
                {Array.from({ length: milestoneCount }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center animate-fade-in">
                    <div className="flex-grow">
                      <input className="glass-input w-full rounded-lg px-4 py-3 text-sm text-white"
                        placeholder={`Milestone #${i + 1} Description`} type="text"
                        value={descriptions[i] || ""} onChange={(e) => {
                          const d = [...descriptions]; d[i] = e.target.value; setDescriptions(d);
                        }} required />
                    </div>
                    <div className="w-24 relative">
                      <input className="glass-input w-full rounded-lg px-3 py-3 text-sm text-white text-right"
                        placeholder="%" type="number" value={percentages[i] || 0} onChange={(e) => {
                          const p = [...percentages]; p[i] = parseInt(e.target.value) || 0; setPercentages(p);
                        }} required />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-on-surface-variant/40">%</span>
                    </div>
                    {milestoneCount > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMilestone(i)}
                        className="p-3 bg-error/10 hover:bg-error/20 border border-error/25 hover:border-error/50 text-error rounded-lg flex items-center justify-center transition-all cursor-pointer"
                        title="Delete Milestone"
                      >
                        <Icon className="text-sm">close</Icon>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  className="w-full py-3 mt-2 rounded-lg border border-dashed border-white/20 hover:border-primary/50 text-on-surface-variant hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer bg-white/5 hover:bg-white/10"
                >
                  <Icon className="text-sm">add</Icon> Add Milestone
                </button>
              </div>
            </div>

            <button type="submit"
              className="glow-button w-full py-4 rounded-xl text-[24px] leading-[32px] font-bold text-white flex items-center justify-center gap-3"
              disabled={totalPct !== 100 || !deposit || txPending}
              style={{ opacity: totalPct !== 100 || !deposit || txPending ? 0.5 : 1 }}>
              {txPending ? (
                <span className="animate-pulse">Processing Transaction...</span>
              ) : (
                <><Icon>add_circle</Icon> Deposit & Create</>
              )}
            </button>
          </form>
        </div>
      </div>
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
