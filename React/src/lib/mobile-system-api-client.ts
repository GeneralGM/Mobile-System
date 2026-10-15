/**
 * Shared API client for the TanStack/React frontend.
 *
 * Set VITE_API_URL to the LAN API base, e.g. http://192.168.1.10:5000.
 * When the UI is served from the same host name as the API, the default resolves
 * to that same host on port 5000 (no hard-coded server IP in source).
 */
const configuredBase = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_URL;

// Avoid touching `window` during TanStack Start SSR. The fallback is primarily for
// server-side imports; browser requests resolve to the current host on port 5000.
const defaultBase = typeof window === 'undefined'
  ? 'http://127.0.0.1:5000'
  : `${window.location.protocol}//${window.location.hostname}:5000`;
export const API_BASE_URL = (configuredBase || defaultBase).replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('تعذر الاتصال بالسيرفر المحلي. تأكد أن جهاز السيرفر شغال وعلى نفس الشبكة.', 0);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(data?.error || `API request failed (${response.status})`, response.status, data);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type ServerRecord<T> = T & {
  _revision: number;
  _createdAt: string;
  _updatedAt: string;
};

export const apiClient = {
  health: () => request<{ ok: boolean; api: string; database: string; databaseName?: string }>('/api/health'),
  list<T>(collection: string) {
    return request<Array<ServerRecord<T>>>(`/api/collections/${encodeURIComponent(collection)}`);
  },
  get<T>(collection: string, id: string) {
    return request<ServerRecord<T>>(`/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
  },
  create<T extends Record<string, unknown>>(collection: string, record: T) {
    const id = String(record.id ?? record.returnId ?? record.invoiceNumber ?? record.imei ?? '');
    if (!id) throw new Error('السجل لازم يحتوي على id أو returnId أو invoiceNumber أو imei');
    return request<ServerRecord<T>>(`/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify({ record }),
    });
  },
  update<T extends Record<string, unknown>>(collection: string, record: T & { _revision: number }) {
    const id = String(record.id ?? record.returnId ?? record.invoiceNumber ?? record.imei ?? '');
    if (!id) throw new Error('السجل لا يحتوي على معرّف');
    const { _revision: revision, _createdAt: _createdAt, _updatedAt: _updatedAt, ...cleanRecord } = record as T & ServerRecord<T>;
    void _createdAt; void _updatedAt;
    return request<ServerRecord<T>>(`/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify({ record: cleanRecord, revision }),
    });
  },
  remove(collection: string, id: string, revision: number) {
    return request<void>(`/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'If-Match': String(revision) },
    });
  },
};
