
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";

import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import CreateInvoice from "./pages/CreateInvoice";
import Transactions from "./pages/Transactions";
import Approvals from "./pages/Approvals";
import Settings from "./pages/Settings";

import "./App.css";

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/create-invoice" element={<CreateInvoice />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
