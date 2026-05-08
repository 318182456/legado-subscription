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
  if (res.status === 401) {
    // 只有在非登录页面才清理并重定向
    if (!path.includes("/api/auth/login")) {
      clearToken();
      window.dispatchEvent(new CustomEvent("unauthorized"));
    }
    throw new Error("认证失败");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
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
  const data = await apiFetch<{ ok: boolean; data: PasskeyItem[] }>("/api/auth/passkey/list");
  return data.data;
}

export async function deletePasskey(id: string): Promise<void> {
  await apiFetch(`/api/auth/passkey/delete/${id}`, { method: "DELETE" });
}

export async function registerPasskey(): Promise<string> {
  const options = await apiFetch<any>("/api/auth/passkey/register/begin", {
    method: "POST",
  });
  const response = await startRegistration(options.data);
  const result = await apiFetch<{ ok: boolean; data: { name: string } }>(
    "/api/auth/passkey/register/finish",
    { method: "POST", body: JSON.stringify(response) }
  );
  return result.data.name;
}

export async function loginWithPasskey(): Promise<string> {
  const options = await apiFetch<any>("/api/auth/passkey/login/begin", {
    method: "POST",
  });
  const response = await startAuthentication(options.data);
  const data = await apiFetch<{ ok: boolean; data: { token: string } }>(
    "/api/auth/passkey/login/finish",
    { method: "POST", body: JSON.stringify(response) }
  );
  setToken(data.data.token);
  return data.data.token;
}

// ---------- API ----------

export const getStats = () => apiFetch<{ ok: boolean; data: Stats }>("/api/stats").then(r => r.data);

export const getSubscriptions = () => apiFetch<{ ok: boolean; data: Subscription[] }>("/api/subscriptions").then(r => r.data);

export const addSubscription = (data: { name: string; url: string; type: "source" | "rule" }) =>
  apiFetch<any>("/api/subscriptions", { method: "POST", body: JSON.stringify(data) });

export const deleteSubscription = (id: number) =>
  apiFetch<any>(`/api/subscriptions/${id}`, { method: "DELETE" });

export const toggleSubscription = (id: number, enabled: boolean) =>
  apiFetch<any>(`/api/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });

export const syncAll = () => apiFetch<any>("/api/sync", { method: "POST" });
export const syncOne = (id: number) => apiFetch<any>(`/api/sync/${id}`, { method: "POST" });

export const getSources = (q = "") => apiFetch<{ ok: boolean; data: any[] }>(`/api/sources?q=${q}`).then(r => r.data);
export const getRules = (q = "") => apiFetch<{ ok: boolean; data: any[] }>(`/api/rules?q=${q}`).then(r => r.data);
