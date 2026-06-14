import { createContext, useContext, useState, useEffect } from "react";

const WalletContext = createContext();

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
    } catch (err) {
      console.error("User rejected connection");
    }
    setIsConnecting(false);
  };

  const disconnect = () => setAccount(null);

  useEffect(() => {
    // Auto-connect if already authorized
    window.ethereum?.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts[0]) setAccount(accounts[0]);
    });

    // Listen for account changes
    window.ethereum?.on("accountsChanged", (accounts) => {
      setAccount(accounts[0] || null);
    });
  }, []);

  return (
    <WalletContext.Provider value={{ account, isConnecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
