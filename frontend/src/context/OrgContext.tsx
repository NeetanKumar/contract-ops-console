import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Organisation } from "../types/contract";

const STORAGE_KEY = "contract-ops-console:selected-org-id";

type OrgContextValue = {
  organisations: Organisation[];
  isLoading: boolean;
  selectedOrgId: string | null;
  setSelectedOrgId: (id: string) => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["organisations"],
    queryFn: api.listOrganisations,
  });

  const organisations = data?.organisations ?? [];

  useEffect(() => {
    if (organisations.length === 0) return;
    const stillValid = organisations.some((org) => org.id === selectedOrgId);
    if (!stillValid) {
      setSelectedOrgIdState(organisations[0].id);
      localStorage.setItem(STORAGE_KEY, organisations[0].id);
    }
  }, [organisations, selectedOrgId]);

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <OrgContext.Provider value={{ organisations, isLoading, selectedOrgId, setSelectedOrgId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
