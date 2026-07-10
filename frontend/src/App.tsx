import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { OrgProvider, useOrg } from "./context/OrgContext";
import { ToastProvider } from "./context/ToastContext";
import { OrgSelector } from "./components/OrgSelector";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { useOrgEventStream } from "./hooks/useOrgEventStream";
import { ContractListPage } from "./pages/ContractListPage";
import { UploadPage } from "./pages/UploadPage";
import { ContractDetailPage } from "./pages/ContractDetailPage";

function AppShell() {
  const { selectedOrgId } = useOrg();
  const connectionState = useOrgEventStream(selectedOrgId);

  return (
    <BrowserRouter>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4">
          <Link to="/" className="text-lg font-semibold">
            Contract Ops Console
          </Link>
          <div className="flex items-center gap-4">
            <ConnectionIndicator state={connectionState} />
            <OrgSelector />
          </div>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ContractListPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/contracts/:id" element={<ContractDetailPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <OrgProvider>
        <AppShell />
      </OrgProvider>
    </ToastProvider>
  );
}
