import type {
  Contract,
  ContractEvent,
  ContractListResponse,
  FieldErrors,
  Organisation,
} from "../types/contract";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  fieldErrors?: FieldErrors;

  constructor(status: number, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = RequestInit & { orgId?: string };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { orgId, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(orgId ? { "X-Org-Id": orgId } : {}),
      ...headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => undefined);

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Request failed", data?.fieldErrors);
  }

  return data as T;
}

export const api = {
  listOrganisations: () => request<{ organisations: Organisation[] }>("/api/organisations"),

  listContracts: (orgId: string, params: URLSearchParams) =>
    request<ContractListResponse>(`/api/contracts?${params.toString()}`, { orgId }),

  getContract: (orgId: string, id: string) => request<Contract>(`/api/contracts/${id}`, { orgId }),

  getContractEvents: (orgId: string, id: string) =>
    request<{ events: ContractEvent[] }>(`/api/contracts/${id}/events`, { orgId }),

  createContract: (orgId: string, body: unknown) =>
    request<Contract>("/api/contracts", { orgId, method: "POST", body: JSON.stringify(body) }),

  updateContract: (orgId: string, id: string, body: unknown) =>
    request<Contract>(`/api/contracts/${id}`, { orgId, method: "PUT", body: JSON.stringify(body) }),

  finalizeContract: (orgId: string, id: string) =>
    request<Contract>(`/api/contracts/${id}/finalize`, { orgId, method: "POST" }),

  archiveContract: (orgId: string, id: string) =>
    request<Contract>(`/api/contracts/${id}/archive`, { orgId, method: "POST" }),

  deleteContract: (orgId: string, id: string) =>
    request<void>(`/api/contracts/${id}`, { orgId, method: "DELETE" }),

  uploadAttachment: async (orgId: string, id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/contracts/${id}/attachment`, {
      method: "POST",
      headers: { "X-Org-Id": orgId },
      body: formData,
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) {
      throw new ApiError(res.status, data?.error ?? "Upload failed", data?.fieldErrors);
    }
    return data as Contract;
  },

  attachmentUrl: (orgId: string, id: string) =>
    `${API_URL}/api/contracts/${id}/attachment?org_id=${orgId}`,

  deleteAttachment: (orgId: string, id: string) =>
    request<void>(`/api/contracts/${id}/attachment`, { orgId, method: "DELETE" }),
};

export { API_URL };
