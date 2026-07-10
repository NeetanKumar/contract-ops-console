import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import type { ContractStatus } from "../types/contract";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 10;

const STATUS_OPTIONS: (ContractStatus | "")[] = ["", "DRAFT", "FINALIZED", "ARCHIVED"];

export function ContractListPage() {
  const { selectedOrgId } = useOrg();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContractStatus | "">("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (status) params.set("status", status);
  if (search) {
    if (UUID_PATTERN.test(search)) {
      params.set("contract_id", search);
    } else {
      params.set("client_name", search);
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contracts", selectedOrgId, params.toString()],
    queryFn: () => api.listContracts(selectedOrgId!, params),
    enabled: !!selectedOrgId,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contracts</h1>
        <Link
          to="/upload"
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Upload contract
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by client name or contract ID…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="min-w-64 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ContractStatus | "")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "" ? "All statuses" : option}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {isError && <p className="text-sm text-red-600">Failed to load contracts.</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">PO Ref</th>
                  <th className="px-4 py-2">PO Date</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.contracts.map((contract) => (
                  <tr key={contract.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{contract.clientName}</td>
                    <td className="px-4 py-2">{contract.poRefNo}</td>
                    <td className="px-4 py-2">{contract.poDate.slice(0, 10)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={contract.status} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link to={`/contracts/${contract.id}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.contracts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No contracts match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              {data.total} contract{data.total === 1 ? "" : "s"} · Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
