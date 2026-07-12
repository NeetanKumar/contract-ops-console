import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { OrgProvider, useOrg } from "./context/OrgContext";
import { ToastProvider } from "./context/ToastContext";
import { OrgSelector } from "./components/OrgSelector";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { useOrgEventStream } from "./hooks/useOrgEventStream";
import { ContractListPage } from "./pages/ContractListPage";
import { UploadPage } from "./pages/UploadPage";
import { ContractDetailPage } from "./pages/ContractDetailPage";

function Logo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-7 w-7 shrink-0">
      <rect width="48" height="48" rx="12" className="fill-indigo-600" />
      <path d="M14 12h14l8 8v16a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2Z" fill="white" fillOpacity="0.95" />
      <path d="M28 12v8h8" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 25h14M17 30h14M17 20h6" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AppShell() {
  const { selectedOrgId } = useOrg();
  const connectionState = useOrgEventStream(selectedOrgId);

  return (
    <BrowserRouter>
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100"
          >
            <Logo />
            <span className="hidden sm:inline">Contract Ops Console</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
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
