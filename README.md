# 🪙 MilestonePay

MilestonePay is a decentralized escrow and milestone payment application built on Ethereum smart contracts. It bridges the trust gap between remote clients and freelancers by locking project funds in an immutable escrow vault at creation and releasing payouts gradually as work milestones are completed and approved.

The application includes advanced decentralized governance features, including **technical audits**, **arbitrated dispute resolution**, and **post-deadline client safeguards**.

---

## 🚀 Key Features

*   **Secure On-Chain Escrow**: Client deposits are locked securely in the smart contract on creation, preventing unilateral fund recalls during the active contract.
*   **Dynamic Milestone Allocation**: The React frontend features a drag-and-drop / add-and-delete milestone builder that dynamically calculates payment allocations.
*   **AI Milestone Engine**: Powered by Google Gemini, the DApp can automatically analyze project scopes and generate structured milestone suggestions with estimated percentage weights.
*   **Anti-Habituation Audits**: Integrates role-based permissions (`TECHNICAL_STAFF_ROLE`) allowing independent technical reviewers to audit work and submit reports, receiving a `0.25%` fee from the contract.
*   **Decentralized Multi-Sig Arbitration**: Active disputes are locked on-chain and resolved via majority vote (2 out of 3) by three designated arbitrators.
*   **Post-Deadline Cancellation**: Protects clients from abandoned projects by allowing them to cancel and receive refunds for incomplete/unapproved milestones once the project deadline has passed.
*   **On-Chain Transaction Ledger**: Scans past events on-chain (e.g. `ProjectCreated`, `MilestoneApproved`, `ProjectCancelled`) to build a transparent transaction history.

---

## 🛠️ Tech Stack

*   **Smart Contracts**: Solidity (v0.8.x), Hardhat, OpenZeppelin AccessControl.
*   **Frontend**: React.js, Vite, TailwindCSS.
*   **Blockchain Integration**: Ethers.js (v6), RainbowKit, Wagmi.
*   **AI Engine**: Google Gemini API.

---

## 📦 Local Installation & Setup

### Prerequisites
*   Node.js (v18 or higher)
*   MetaMask Browser Extension

### 1. Clone & Install Dependencies
Install dependencies in both the root directory (for Hardhat) and the frontend folder:
```bash
# Root folder (Hardhat environment)
npm install

# Frontend folder
cd frontend
npm install
cd ..
```

### 2. Configure Environment Variables
Create a `.env.local` file inside the `frontend/` directory to enable the Gemini suggestions feature:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Run the Smart Contract Test Suite
We have designed a test suite with **31 unit tests** validating project creation, milestone approvals, dispute votes, and fees:
```bash
npm test
```

### 4. Run a Local Blockchain Node
Start a local Hardhat node to simulate the Ethereum blockchain:
```bash
npx hardhat node
```

### 5. Compile and Deploy the Contracts
In a new terminal window, compile and deploy the smart contracts to the local node:
```bash
# Compile and copy ABI to the frontend
npm run compile

# Deploy contracts locally
npm run deploy:local
```

### 6. Connect MetaMask to Hardhat Node
1.  Open the MetaMask extension.
2.  Add a custom network:
    *   **Network Name**: Localhost 8545 / Hardhat
    *   **RPC URL**: `http://127.0.0.1:8545`
    *   **Chain ID**: `31337`
    *   **Currency Symbol**: ETH
3.  Import private keys from the Hardhat terminal output to access pre-funded test accounts (each containing 10,000 test ETH).

### 7. Run the Frontend Development Server
Start the React frontend server:
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser to interact with the DApp!

---
