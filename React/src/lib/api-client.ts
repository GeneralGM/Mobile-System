/*
 * API adapter for the Mobile System frontend.
 * Runtime configuration is read from /config.json, so the API IP can be
 * changed without rebuilding React. Keep config.json in the public root
 * (for the current deployment: .output/public/config.json).
 */

type RuntimeApiConfig = {
  API_BASE_URL?: unknown;
  apiBaseUrl?: unknown;
  api_base_url?: unknown;
  API_URL?: unknown;
  apiUrl?: unknown;
  api_url?: unknown;
  apiBase?: unknown;
  BASE_URL?: unknown;
  baseUrl?: unknown;
  url?: unknown;
  API_SERVER?: unknown;
  apiServer?: unknown;
  API_HOST?: unknown;
  apiHost?: unknown;
  API_IP?: unknown;
  apiIp?: unknown;
  SERVER_IP?: unknown;
  server_ip?: unknown;
  API_ADDRESS?: unknown;
  apiAddress?: unknown;
  backendUrl?: unknown;
  backendURL?: unknown;
  backendIp?: unknown;
  backendIP?: unknown;
  serverIP?: unknown;
  serverIp?: unknown;
  API_PORT?: unknown;
  apiPort?: unknown;
  SERVER_PORT?: unknown;
  serverPort?: unknown;
  PORT?: unknown;
  port?: unknown;
  api?: unknown;
  server?: unknown;
};

let runtimeApiBasePromise: Promise<string | null> | null = null;

function normalizeApiBase(value: unknown, portValue?: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;

  try {
    const url = new URL(raw);
    if (!url.port && portValue !== undefined && String(portValue).trim()) {
      const port = Number(portValue);
      if (Number.isInteger(port) && port > 0 && port <= 65535)
        url.port = String(port);
    } else if (!url.port && url.protocol === "http:") {
      url.port = "5000";
    }
    // API client paths already start with /api; avoid /api/api/... if config uses an /api suffix.
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api$/i, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return null;
}

async function readRuntimeApiBase(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(`/config.json?_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const config = (await response.json()) as RuntimeApiConfig;
    const apiObject =
      config.api && typeof config.api === "object"
        ? (config.api as Record<string, unknown>)
        : {};
    const serverObject =
      config.server && typeof config.server === "object"
        ? (config.server as Record<string, unknown>)
        : {};

    const fullUrl = firstText(
      config.API_BASE_URL,
      config.apiBaseUrl,
      config.api_base_url,
      config.API_URL,
      config.apiUrl,
      config.api_url,
      config.apiBase,
      config.BASE_URL,
      config.baseUrl,
      config.url,
      config.API_SERVER,
      config.apiServer,
      typeof config.api === "string" ? config.api : undefined,
      typeof config.server === "string" ? config.server : undefined,
      config.backendUrl,
      config.backendURL,
      apiObject.baseUrl,
      apiObject.baseURL,
      apiObject.url,
      apiObject.apiUrl,
      serverObject.apiBaseUrl,
      serverObject.apiUrl,
      serverObject.url,
    );
    if (fullUrl) {
      const candidate = normalizeApiBase(
        fullUrl,
        config.API_PORT ??
          config.apiPort ??
          config.SERVER_PORT ??
          config.serverPort ??
          config.PORT ??
          apiObject.port ??
          serverObject.apiPort,
      );
      if (candidate) return candidate;
    }

    const host = firstText(
      config.API_HOST,
      config.apiHost,
      config.API_IP,
      config.apiIp,
      config.SERVER_IP,
      config.server_ip,
      config.API_ADDRESS,
      config.apiAddress,
      config.backendIp,
      config.backendIP,
      config.serverIP,
      config.serverIp,
      apiObject.host,
      apiObject.ip,
      serverObject.ip,
      serverObject.host,
    );
    const port =
      config.API_PORT ??
      config.apiPort ??
      config.SERVER_PORT ??
      config.serverPort ??
      config.PORT ??
      config.port ??
      apiObject.port ??
      serverObject.apiPort ??
      5000;
    if (host) return normalizeApiBase(host, port);
  } catch (error) {
    // Don't break the app if runtime config is absent; use environment/hostname fallback.
    console.warn(
      "تعذر قراءة /config.json، سيتم استخدام عنوان API الاحتياطي.",
      error,
    );
  }
  return null;
}

async function getApiBase(): Promise<string> {
  if (!runtimeApiBasePromise) runtimeApiBasePromise = readRuntimeApiBase();
  const runtimeBase = await runtimeApiBasePromise;
  if (runtimeBase) return runtimeBase;

  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured?.trim())
    return (
      normalizeApiBase(configured.trim()) ??
      configured.trim().replace(/\/$/, "")
    );
  if (typeof window !== "undefined") {
    // Default: API runs on the same computer as the website, port 5000.
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return "http://127.0.0.1:5000";
}

const getToken = () =>
  (import.meta.env.VITE_API_TOKEN as string | undefined)?.trim();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  employeeSessionToken?: string,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (employeeSessionToken)
    headers.set("X-Employee-Session", employeeSessionToken);
  let response: Response;
  try {
    response = await fetch(`${await getApiBase()}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(
      "تعذر الاتصال بالخادم. تأكد أن السيرفر يعمل وأن عنوان API صحيح.",
      0,
    );
  }
  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `فشل الطلب (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

const json = (method: string, value?: unknown): RequestInit => ({
  method,
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});

export type EmployeeRole =
  | "worker"
  | "accountant"
  | "manager"
  | "owner"
  | "developer";

export type EmployeeRecord = {
  id: string;
  name: string;
  role: EmployeeRole;
  managerId: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type EmployeeSession = {
  token: string;
  expiresAt: number;
  employee: EmployeeRecord;
};

export type EmployeeInput = {
  name: string;
  role: EmployeeRole;
  pin?: string;
  managerId?: string | null;
};

// Employee session token stays in memory and is attached only to protected employee routes.
let pendingEmployeeSessionToken: string | null = null;

function takeEmployeeSessionToken(explicitToken?: string): string {
  if (explicitToken) return explicitToken;
  if (!pendingEmployeeSessionToken) {
    throw new ApiError(
      "التحقق من صلاحية الموظف مطلوب. أدخل الرقم السري مرة أخرى.",
      401,
    );
  }
  return pendingEmployeeSessionToken;
}

export const api = {
  // Employee sessions are short-lived, signed by the backend, and kept in page memory.
  authenticateEmployee: async (input: { name: string; pin: string }) => {
    const session = await request<EmployeeSession>(
      "/api/employees/authenticate",
      json("POST", input),
    );
    pendingEmployeeSessionToken = session.token;
    return session;
  },
  authenticateEmployeeByPin: async (pin: string) => {
    const session = await request<EmployeeSession>(
      "/api/employees/authenticate-pin",
      json("POST", { pin }),
    );
    pendingEmployeeSessionToken = session.token;
    return session;
  },
  clearEmployeeSessionAuthorization: () => {
    pendingEmployeeSessionToken = null;
  },
  setEmployeeSessionAuthorization: (token: string) => {
    pendingEmployeeSessionToken = token;
  },
  getEmployeeDirectory: () =>
    request<EmployeeRecord[]>("/api/employees/directory"),
  bootstrapEmployeeOwner: (
    input: { name: string; pin: string },
    bootstrapToken: string,
  ) =>
    request<EmployeeSession>("/api/employees/bootstrap", {
      ...json("POST", input),
      headers: { "X-Bootstrap-Token": bootstrapToken },
    }),
  getEmployees: (sessionToken: string) =>
    request<EmployeeRecord[]>("/api/employees", {}, sessionToken),
  createEmployee: (input: EmployeeInput, sessionToken?: string) =>
    request<EmployeeRecord>(
      "/api/employees",
      json("POST", input),
      takeEmployeeSessionToken(sessionToken),
    ),
  updateEmployee: (id: string, input: EmployeeInput, sessionToken?: string) =>
    request<EmployeeRecord>(
      `/api/employees/${encodeURIComponent(id)}`,
      json("PUT", input),
      takeEmployeeSessionToken(sessionToken),
    ),
  deleteEmployee: (id: string, sessionToken?: string) =>
    request<{ ok: boolean; employee: EmployeeRecord }>(
      `/api/employees/${encodeURIComponent(id)}`,
      json("DELETE"),
      takeEmployeeSessionToken(sessionToken),
    ),
  health: () =>
    request<{
      ok: boolean;
      api: string;
      database: string;
      databaseName: string;
    }>("/api/health"),
  getBrands: () => request<BrandRecord[]>("/api/brands"),
  // POST behaves as an upsert by the supplied ID/name; safe for newly-created client IDs.
  saveBrand: (brand: BrandRecord) =>
    request<BrandRecord>("/api/brands", json("POST", brand)),
  deleteBrand: (id: string) =>
    request<{ ok: boolean }>(
      `/api/brands/${encodeURIComponent(id)}`,
      json("DELETE"),
    ),

  getWarehouseBatches: () =>
    request<WarehouseBatchRecord[]>("/api/warehouse-batches"),
  createWarehouseBatch: (batch: WarehouseBatchRecord) =>
    request<WarehouseBatchRecord>(
      "/api/warehouse-batches",
      json("POST", batch),
    ),
  updateWarehouseBatch: (id: string, batch: Partial<WarehouseBatchRecord>) =>
    request<WarehouseBatchRecord>(
      `/api/warehouse-batches/${encodeURIComponent(id)}`,
      json("PUT", batch),
    ),
  deleteWarehouseBatch: (id: string) =>
    request<{ ok: boolean }>(
      `/api/warehouse-batches/${encodeURIComponent(id)}`,
      json("DELETE"),
    ),

  getDevices: (q?: string) =>
    request<DeviceRecord[]>(
      `/api/devices${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  createDevice: (device: DeviceRecord) =>
    request<DeviceRecord>("/api/devices", json("POST", device)),
  updateDevice: (id: string, device: Partial<DeviceRecord>) =>
    request<DeviceRecord>(
      `/api/devices/${encodeURIComponent(id)}`,
      json("PUT", device),
    ),
  deleteDevice: (id: string) =>
    request<{ ok: boolean }>(
      `/api/devices/${encodeURIComponent(id)}`,
      json("DELETE"),
    ),

  getSales: (q?: string) =>
    request<SaleRecord[]>(
      `/api/sales${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getSale: (id: string) =>
    request<SaleRecord>(`/api/sales/${encodeURIComponent(id)}`),
  createSale: (sale: SaleRecord) =>
    request<SaleRecord>("/api/sales", json("POST", sale)),

  getPayments: (saleId?: string) =>
    request<PaymentRecord[]>(
      `/api/payments${saleId ? `?saleId=${encodeURIComponent(saleId)}` : ""}`,
    ),
  recordPayment: (payment: {
    saleId: string;
    installmentNumber?: number;
    amount: number;
    note?: string;
  }) =>
    request<{ ok: boolean; paymentId: string; sale: SaleRecord }>(
      "/api/payments",
      json("POST", payment),
    ),

  getReturns: () => request<ReturnRecord[]>("/api/returns"),
  createReturn: (value: {
    invoiceId: string;
    itemIndex: number;
    quantityReturned: number;
    reason: ReturnRecord["reason"];
    deviceCondition: ReturnRecord["deviceCondition"];
    settlementMethod: ReturnRecord["settlementMethod"];
  }) => request<ReturnRecord>("/api/returns", json("POST", value)),
  confirmReturnSettlement: (returnId: string) =>
    request<ReturnRecord>(
      `/api/returns/${encodeURIComponent(returnId)}/settlement`,
      json("PUT", {}),
    ),

  getCustomers: (q?: string) =>
    request<CustomerRecord[]>(
      `/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getOffers: () => request<OfferRecord[]>("/api/offers"),
  // POST accepts an ID and upserts an existing offer name when possible.
  saveOffer: (offer: OfferRecord) =>
    request<OfferRecord>("/api/offers", json("POST", offer)),
  getSettings: () =>
    request<Array<{ key: string; value: unknown; updatedAt: number }>>(
      "/api/settings",
    ),
  saveSetting: (key: string, value: unknown) =>
    request<{ key: string; value: unknown; updatedAt: number }>(
      `/api/settings/${encodeURIComponent(key)}`,
      json("PUT", { value }),
    ),

  // Accessory catalog and stock batches
  getAccessoryCategories: () =>
    request<Array<{ id: string; name: string }>>("/api/accessory-categories"),
  saveAccessoryCategory: (name: string) =>
    request<{ id: string; name: string }>(
      "/api/accessory-categories",
      json("POST", { name }),
    ),
  getAccessoryBrands: () =>
    request<Array<{ id: string; name: string }>>("/api/accessory-brands"),
  saveAccessoryBrand: (name: string) =>
    request<{ id: string; name: string }>(
      "/api/accessory-brands",
      json("POST", { name }),
    ),
  getAccessoryBatches: (q?: string) =>
    request<AccessoryBatchRecord[]>(
      `/api/accessory-batches${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  createAccessoryBatch: (batch: AccessoryBatchRecord) =>
    request<AccessoryBatchRecord>(
      "/api/accessory-batches",
      json("POST", batch),
    ),

  // Electronic wallets / InstaPay transfer-line management
  getTransferLines: () => request<TransferLineRecord[]>("/api/transfer-lines"),
  createTransferLine: (line: TransferLineInput) =>
    request<TransferLineRecord>("/api/transfer-lines", json("POST", line)),
  updateTransferLine: (
    id: string,
    line: TransferLineInput & { isActive?: boolean },
  ) =>
    request<TransferLineRecord>(
      `/api/transfer-lines/${encodeURIComponent(id)}`,
      json("PUT", line),
    ),
  deactivateTransferLine: (id: string) =>
    request<{ ok: boolean; line: TransferLineRecord }>(
      `/api/transfer-lines/${encodeURIComponent(id)}`,
      json("DELETE"),
    ),

  // Per-operation transfer commissions
  getTransferCommissions: () =>
    request<TransferCommissionSettings>("/api/transfer-commissions"),
  saveTransferCommissions: (settings: TransferCommissionSettings) =>
    request<TransferCommissionSettings>(
      "/api/transfer-commissions",
      json("PUT", settings),
    ),

  // Atomic withdrawal/transfer operation; the backend enforces balance and limits.
  createTransfer: (input: CreateTransferInput) =>
    request<TransferTransactionRecord>("/api/transfers", json("POST", input)),

  // Transfer history and optional query filters
  getTransfers: (filters: TransferHistoryFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value));
      }
    }
    const query = params.toString();
    return request<TransferTransactionRecord[]>(
      `/api/transfers${query ? `?${query}` : ""}`,
    );
  },

  importLocalStorage: (payload: LocalStorageSnapshot) =>
    request<{ ok: boolean; importKey: string; alreadyImported: boolean }>(
      "/api/import/localstorage",
      json("POST", payload),
    ),
  stats: () =>
    request<{
      salesCount: number;
      salesTotal: number;
      outstanding: number;
      unitsAvailable: number;
      customersCount: number;
    }>("/api/stats"),
};

export type BrandRecord = {
  id: string;
  name: string;
  models: string[];
  series: Array<{ name: string; models: string[] }>;
};
export type WarehouseBatchRecord = {
  id: string;
  brand: string;
  series: string;
  model: string;
  receivedQuantity: number;
  availableQuantity: number;
  unitCost: number;
  salePrice: number;
  supplierName: string;
  receivedAt: number;
  imeis: string[];
};
export type AccessoryBatchRecord = {
  id: string;
  itemType: "accessory";
  category: string;
  brand: string;
  productName: string;
  model: string;
  compatibleModel?: string;
  variantType?: string;
  variantValue?: string;
  receivedQuantity: number;
  availableQuantity: number;
  unitCost: number;
  salePrice: number;
  supplierName: string;
  receivedAt: number;
};
export type DeviceRecord = {
  id: string;
  imei: string;
  brand: string;
  series: string;
  model: string;
  color: string;
  ram: string;
  storage: string;
  salePrice: number;
  installmentPrice: number;
  offer: OfferRecord | null;
  status: "available" | "sold" | "reserved";
  createdAt: number;
  warehouseBatchId?: string;
  unitCost?: number;
};
export type OfferRecord = {
  id: string;
  name: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  durationDays: number;
  expiresAt: number;
};
export type SaleInstallmentRecord = {
  number: number;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAmount?: number;
};
export type SaleItemRecord = {
  deviceId: string;
  brand: string;
  series: string;
  model: string;
  color: string;
  ram: string;
  storage: string;
  originalPrice: number;
  cashPrice: number;
  installmentPrice: number;
  cashFinalPrice: number;
  installmentFinalPrice: number;
  finalPrice: number;
  offerName?: string;
  quantity: number;
  warehouseBatchId?: string;
  unitCost?: number;
  isNewStock?: boolean;
  returnedQuantity?: number;
  itemType?: "mobile" | "accessory";
  accessoryBatchId?: string;
  accessoryCategory?: string;
  accessoryBrand?: string;
  compatibleModel?: string;
  variantType?: string;
  variantValue?: string;
};
export type SaleRecord = {
  id: string;
  invoiceNumber: string;
  createdAt: number;
  items: SaleItemRecord[];
  customerName: string;
  customerPhone: string;
  paymentMethod: "cash" | "credit" | "installment";
  total: number;
  amountPaid: number;
  remainingAmount: number;
  returnBalanceReduced?: number;
  originalInstallmentAmount?: number;
  installmentsCount: number;
  installments: SaleInstallmentRecord[];
  notes: string;
  status: "paid" | "partial" | "unpaid";
};
export type PaymentRecord = {
  id: string;
  saleId: string;
  installmentNumber?: number;
  amount: number;
  recordType: string;
  createdAt: number;
  note: string;
};
export type ReturnRecord = {
  returnId: string;
  returnNumber?: string;
  createdAt: string | number;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  itemIndex: number;
  deviceId: string;
  model: string;
  quantityReturned: number;
  unitPrice: number;
  totalRefundAmount: number;
  usageFee?: number;
  netReturnAmount?: number;
  balanceReduced: number;
  customerRefundAmount: number;
  settlementStatus: "pending" | "completed";
  reason: "defect" | "change_mind" | "unsuitable" | "other";
  deviceCondition: "sound" | "damaged" | "inspection_needed";
  settlementMethod:
    | "cash_refund"
    | "store_credit"
    | "remaining_settlement"
    | "exchange";
  status: "completed";
  linkedNewInvoiceNumber?: string;
};
export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  createdAt: number;
  updatedAt: number;
};
export type LocalStorageSnapshot = {
  importKey: string;
  brands?: BrandRecord[];
  devices?: DeviceRecord[];
  warehouse?: WarehouseBatchRecord[];
  sales?: SaleRecord[];
  returns?: ReturnRecord[];
};

export type TransferService = "wallet" | "instapay";
export type TransferOperationType = "transfer" | "withdrawal";

export type TransferLineRecord = {
  id: string;
  phone: string;
  ownerName: string;
  walletType: string;
  bankName: string;
  lastFour: string;
  supportsWallet: boolean;
  supportsInstapay: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  balance: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TransferLineInput = {
  phone: string;
  ownerName: string;
  walletType: string;
  bankName: string;
  lastFour: string;
  supportsWallet: boolean;
  supportsInstapay: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  balance: number;
};

export type TransferCommissionSettings = {
  wallet_withdrawal: number;
  wallet_transfer: number;
  instapay_withdrawal: number;
  instapay_transfer: number;
  instapay_vodafone_transfer: number;
};

export type CreateTransferInput = {
  operationType: TransferOperationType;
  serviceType: TransferService;
  sourceLineId: string;
  destinationLineId?: string;
  recipientPhone?: string;
  recipientName?: string;
  amount: number;
  transferCost: number;
  transferToVodafone?: boolean;
};

export type TransferTransactionRecord = {
  id: string;
  referenceNumber: string;
  operationType: TransferOperationType;
  serviceType: TransferService;
  commissionType: keyof TransferCommissionSettings;
  sourceLineId: string;
  sourcePhone: string;
  sourceOwnerName: string;
  destinationLineId: string | null;
  destinationPhone: string;
  recipientPhone: string;
  recipientName: string;
  amount: number;
  commission: number;
  transferCost: number;
  profit: number;
  transferToVodafone: boolean;
  createdAt: number;
};

export type TransferHistoryFilters = {
  q?: string;
  operationType?: TransferOperationType | "";
  serviceType?: TransferService | "";
  sourceLineId?: string;
  dateFrom?: string;
  dateTo?: string;
  profitMin?: number | "";
  profitMax?: number | "";
  limit?: number;
};
