import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

// ---------- 类型 ----------

export interface PasskeyItem {
  id: string;
  name: string;
  created_at: string;
}

export interface Subscription {
  id: number;
  name: string;
  url: string;
  type: "source" | "rule";
  enabled: number;
  last_synced: string | null;
  item_count: number;
  created_at: string;
}

export interface Stats {
  subscriptions: {
    total: number;
    sources: number;
    rules: number;
  };
  sources: { enabled: number };
  rules: { enabled: number };
}

// ---------- Token 持久化 ----------

const TOKEN_KEY = "legado_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ---------- 基础请求 ----------

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  
  // 提前解析 JSON 以便统一处理 ok 字段
  const body = await res.json().catch(() => ({ ok: false, error: res.statusText }));

  if (res.status === 401) {
    if (!path.includes("/api/auth/login")) {
      clearToken();
      window.dispatchEvent(new CustomEvent("unauthorized"));
    }
    throw new Error("认证失败");
  }

  if (!res.ok || body.ok === false) {
    throw new Error(body.error || res.statusText);
  }

  // 自动解包 Worker 的 { ok: true, data: T } 结构
  return body.data as T;
}

// ---------- Auth ----------

export async function login(password: string): Promise<string> {
  const data = await apiFetch<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  setToken(data.token);
  return data.token;
}

export async function getPasskeyStatus(): Promise<number> {
  const data = await apiFetch<{ count: number }>("/api/auth/passkey/status");
  return data.count;
}

export async function getPasskeyList(): Promise<PasskeyItem[]> {
  return apiFetch<PasskeyItem[]>("/api/auth/passkey/list");
}

export async function deletePasskey(id: string): Promise<void> {
  await apiFetch(`/api/auth/passkey/delete/${id}`, { method: "DELETE" });
}

export async function registerPasskey(): Promise<string> {
  const options = await apiFetch<any>("/api/auth/passkey/register/begin", {
    method: "POST",
  });
  const response = await startRegistration(options);
  const result = await apiFetch<{ name: string }>(
    "/api/auth/passkey/register/finish",
    { method: "POST", body: JSON.stringify(response) }
  );
  return result.name;
}

export async function loginWithPasskey(): Promise<string> {
  const options = await apiFetch<any>("/api/auth/passkey/login/begin", {
    method: "POST",
  });
  const response = await startAuthentication(options);
  const data = await apiFetch<{ token: string }>(
    "/api/auth/passkey/login/finish",
    { method: "POST", body: JSON.stringify(response) }
  );
  setToken(data.token);
  return data.token;
}

// ---------- API ----------

export const getStats = () => apiFetch<Stats>("/api/stats");

export const getSubscriptions = () => apiFetch<Subscription[]>("/api/subscriptions");

export const addSubscription = (data: { name: string; url: string; type: "source" | "rule" }) =>
  apiFetch<any>("/api/subscriptions", { method: "POST", body: JSON.stringify(data) });

export const deleteSubscription = (id: number) =>
  apiFetch<any>(`/api/subscriptions/${id}`, { method: "DELETE" });

export const toggleSubscription = (id: number, enabled: boolean) =>
  apiFetch<any>(`/api/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });

export const syncAll = () => apiFetch<any>("/api/sync", { method: "POST" });
export const syncOne = (id: number) => apiFetch<any>(`/api/sync/${id}`, { method: "POST" });

export const getSources = (q = "", page = 1, filter = "all") => 
  apiFetch<{ sources: any[], total: number, stats: any, hasMore: boolean }>(`/api/sources?q=${q}&page=${page}&filter=${filter}`);
export const getAllSourceIds = () => apiFetch<number[]>("/api/sources/ids");
export const getRules = (q = "", page = 1) => apiFetch<any[]>(`/api/rules?q=${q}&page=${page}`);

export const testSources = (ids: number[]) => apiFetch<Record<number, boolean>>("/api/sources/test", { method: "POST", body: JSON.stringify({ ids }) });
export const toggleSource = (id: number, enabled: boolean) => apiFetch<any>(`/api/sources/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: enabled ? 1 : 0 }) });
export const deleteSource = (id: number) => apiFetch<any>(`/api/sources/${id}`, { method: "DELETE" });
export const toggleRule = (id: number, enabled: boolean) => apiFetch<any>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: enabled ? 1 : 0 }) });
export const deleteRule = (id: number) => apiFetch<any>(`/api/rules/${id}`, { method: "DELETE" });
export const parseLinks = (url: string) => apiFetch<{ name: string; url: string }[]>(`/api/parse-links?url=${encodeURIComponent(url)}`);
