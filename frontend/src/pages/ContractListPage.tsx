import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { PaperclipIcon } from "../components/PaperclipIcon";
import { ListSkeleton } from "../components/Skeleton";
import { inputBaseClass } from "../lib/inputStyles";
import type { Contract, ContractStatus } from "../types/contract";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const STATUS_OPTIONS: (ContractStatus | "")[] = ["", "DRAFT", "FINALIZED", "ARCHIVED"];

function ClientNameCell({ contract }: { contract: Contract }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {contract.clientName}
      {contract.attachmentFilename && (
        <PaperclipIcon
          className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
          title={`Has attachment: ${contract.attachmentFilename}`}
        />
      )}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-10 w-10 text-gray-300 dark:text-gray-700"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z"
        />
      </svg>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No contracts match your filters</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">Try a different search term or status.</p>
    </div>
  );
}

export function ContractListPage() {
  const { selectedOrgId } = useOrg();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContractStatus | "">("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

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

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
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
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">Contracts</h1>
        <Link
          to="/upload"
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600"
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
          className={`min-w-64 flex-1 ${inputBaseClass} px-3 py-1.5 focus:border-indigo-400 focus:outline-none`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ContractStatus | "")}
          className={`${inputBaseClass} px-3 py-1.5`}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "" ? "All statuses" : option}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <ListSkeleton />}
      {isError && <p className="text-sm text-red-600 dark:text-red-400">Failed to load contracts.</p>}

      {data && (
        <>
          {data.contracts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-800">
              <EmptyState />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm md:block dark:border-gray-800 dark:bg-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5">Client</th>
                      <th className="px-4 py-2.5">PO Ref</th>
                      <th className="px-4 py-2.5">PO Date</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.contracts.map((contract) => (
                      <tr
                        key={contract.id}
                        className="border-t border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
                      >
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-100">
                          <ClientNameCell contract={contract} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{contract.poRefNo}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {contract.poDate.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={contract.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/contracts/${contract.id}`}
                            className="font-medium text-indigo-500 transition-colors hover:text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="space-y-2 md:hidden">
                {data.contracts.map((contract) => (
                  <Link
                    key={contract.id}
                    to={`/contracts/${contract.id}`}
                    className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow dark:border-gray-800 dark:bg-gray-800"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        <ClientNameCell contract={contract} />
                      </span>
                      <StatusBadge status={contract.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{contract.poRefNo}</span>
                      <span>{contract.poDate.slice(0, 10)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span>
              {data.total} contract{data.total === 1 ? "" : "s"} · Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                Per page
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className={`${inputBaseClass} px-2 py-1`}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-400 bg-white px-3 py-1 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-gray-400 bg-white px-3 py-1 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
