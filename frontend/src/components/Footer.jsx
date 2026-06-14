export default function Footer() {
  return (
    <footer className="bg-surface border-t border-white/5 py-12 mt-auto">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 px-4 md:px-6 w-full max-w-[1200px] mx-auto">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="text-primary font-bold text-xl">MilestonePay</span>
          <span className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant/60">
            Built with Solidity · Hardhat · React · Tailwind
          </span>
        </div>
        <div className="flex gap-8">
          <a className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant/60 hover:text-on-surface transition-colors hover:underline" href="#">Docs</a>
          <a className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant/60 hover:text-on-surface transition-colors hover:underline" href="#">Security</a>
          <a className="text-[12px] leading-[16px] tracking-[0.05em] font-semibold text-on-surface-variant/60 hover:text-on-surface transition-colors hover:underline" href="#">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
