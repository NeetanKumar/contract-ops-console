import type {
  Contract,
  ContractEvent,
  ContractListResponse,
  DealExtraction,
  FieldErrors,
  Organisation,
  WhatsAppCloudStatus,
  WhatsAppConnectionStatus,
  WhatsAppNegotiation,
  WhatsAppUnmatchedMessage,
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

/** Shared onError extraction so every mutation shows the server's actual message
 * when there is one, instead of each call site re-deriving this fallback logic. */
export function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
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

  createContractFromWhatsApp: (orgId: string, thread: string) =>
    request<{ contract: Contract; extraction: DealExtraction }>("/api/contracts/from-whatsapp", {
      orgId,
      method: "POST",
      body: JSON.stringify({ thread }),
    }),

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

  getCloudApiStatus: (orgId: string) =>
    request<WhatsAppCloudStatus>("/api/whatsapp/cloud-status", { orgId }),

  listWhatsAppNegotiations: (orgId: string) =>
    request<{ negotiations: WhatsAppNegotiation[] }>("/api/whatsapp/negotiations", { orgId }),

  createWhatsAppNegotiation: (
    orgId: string,
    body: { ourPhone: string; counterpartyPhone: string; direction: "WE_BUY" | "WE_SELL"; label?: string },
  ) =>
    request<WhatsAppNegotiation>("/api/whatsapp/negotiations", {
      orgId,
      method: "POST",
      body: JSON.stringify(body),
    }),

  abandonWhatsAppNegotiation: (orgId: string, id: string) =>
    request<WhatsAppNegotiation>(`/api/whatsapp/negotiations/${id}/abandon`, { orgId, method: "POST" }),

  listUnmatchedMessages: (orgId: string) =>
    request<{ messages: WhatsAppUnmatchedMessage[] }>("/api/whatsapp/unmatched-messages", { orgId }),

  assignUnmatchedMessage: (orgId: string, id: string, negotiationId: string) =>
    request<void>(`/api/whatsapp/unmatched-messages/${id}/assign`, {
      orgId,
      method: "POST",
      body: JSON.stringify({ negotiationId }),
    }),

  getWhatsAppConnection: (orgId: string) =>
    request<WhatsAppConnectionStatus>("/api/whatsapp/connection", { orgId }),

  completeEmbeddedSignup: (
    orgId: string,
    body: { code: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string },
  ) =>
    request<WhatsAppConnectionStatus>("/api/whatsapp/embedded-signup", {
      orgId,
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export { API_URL };
