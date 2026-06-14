export default function StatusBadge({ label, variant = "active" }) {
  const styles = {
    active: "bg-tertiary/10 border-tertiary/20 text-tertiary",
    completed: "bg-white/10 border-white/20 text-on-surface-variant",
    disputed: "bg-error/10 border-error/20 text-error",
    pending: "bg-white/10 border-white/20 text-on-surface-variant",
    approved: "status-glow-green",
  };

  return (
    <span className={`${styles[variant]} px-3 py-1 rounded-full text-[10px] font-bold flex items-center w-fit gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${variant === "active" || variant === "disputed" ? "animate-pulse" : ""}`}></span>
      {label}
    </span>
  );
}
