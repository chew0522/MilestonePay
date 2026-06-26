import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../WalletContext";
import { useContract } from "../useContract";

export default function Navbar() {
  const location = useLocation();
  const { account, isConnecting, connect, disconnect } = useWallet();
  const { contract } = useContract();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTechStaff, setIsTechStaff] = useState(false);

  useEffect(() => {
    async function checkRoles() {
      if (contract && account) {
        try {
          const roleHash = await contract.ARBITRATOR_ROLE();
          const hasRole = await contract.hasRole(roleHash, account);
          setIsAdmin(hasRole);

          const techRoleHash = await contract.TECHNICAL_STAFF_ROLE();
          const hasTechRole = await contract.hasRole(techRoleHash, account);
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
    }
    checkRoles();
  }, [contract, account]);

  const links = [
    { to: "/", label: "Dashboard" },
  ];

  if (!isAdmin && !isTechStaff) {
    links.push({ to: "/projects", label: "Marketplace" });
  }

  links.push({ to: "/completed", label: "History" });

  if (isAdmin || isTechStaff) {
    links.push({ to: "/admin", label: "Admin" });
  }

  return (
    <nav className="bg-surface/10 backdrop-blur-xl top-0 sticky z-50 border-b border-white/10 shadow-[0_0_20px_rgba(73,75,214,0.15)]">
      <div className="flex justify-between items-center px-4 md:px-6 py-4 w-full max-w-[1200px] mx-auto">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-[24px] leading-[32px] font-bold text-primary tracking-tight">
            MilestonePay
          </Link>
          <div className="hidden md:flex gap-6">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={
                  location.pathname === link.to
                    ? "text-primary border-b-2 border-primary pb-1"
                    : "text-on-surface-variant hover:text-primary transition-colors"
                }
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {account ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="font-mono-md text-mono-md text-on-surface">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
              </div>
              <button
                onClick={disconnect}
                className="border border-white/20 px-4 py-2 rounded-full text-sm hover:bg-white/5 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="rainbow-btn px-6 py-2 rounded-full font-semibold text-on-primary active:scale-95 transition-transform"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
