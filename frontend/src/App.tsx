
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";

import Dashboard from "./pages/Dashboard";

import "./App.css";

// Every page lives inside the Dashboard shell (sidebar navigation); old
// standalone URLs such as /transactions or /create-invoice redirect home.
function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
