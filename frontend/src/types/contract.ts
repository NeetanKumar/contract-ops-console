export type ContractStatus = "DRAFT" | "FINALIZED" | "ARCHIVED";

export type LineItem = {
  description: string;
  quantity: number;
  quantity_unit?: string;
  unit_price: number;
  pricing_unit?: string;
  total?: number;
};

export type ContractFieldData = {
  client_name: string;
  po_ref_no: string;
  po_date: string;
  payment_terms?: string;
  delivery_terms?: string;
  items: LineItem[];
};

export type Contract = {
  id: string;
  orgId: string;
  clientName: string;
  poRefNo: string;
  poDate: string;
  status: ContractStatus;
  fieldData: ContractFieldData;
  createdAt: string;
  updatedAt: string;
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  attachmentUploadedAt: string | null;
};

export type ContractEventType = "CREATED" | "UPDATED" | "STATUS_CHANGED" | "DELETED";

export type ContractEvent = {
  id: string;
  contractId: string | null;
  orgId: string;
  eventType: ContractEventType;
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus | null;
  payload: unknown;
  createdAt: string;
};

export type Organisation = {
  id: string;
  name: string;
  createdAt: string;
};

export type FieldErrors = Record<string, string>;

export type ContractListResponse = {
  contracts: Contract[];
  total: number;
  page: number;
  limit: number;
};
