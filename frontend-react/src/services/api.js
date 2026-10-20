// Hardened API Client for Secrets Vault
let sessionToken = "";
let onLockedCallback = null;
let onReauthRequest = null;

export function setSessionToken(token) {
  sessionToken = token;
}

export function getSessionToken() {
  return sessionToken;
}

export function setOnLocked(callback) {
  onLockedCallback = callback;
}

export function setOnReauth(callback) {
  onReauthRequest = callback;
}

export async function fetchSessionToken() {
  try {
    const res = await fetch("/api/session-token");
    const data = await res.json();
    sessionToken = data.token;
    return sessionToken;
  } catch (e) {
    console.warn("Could not retrieve session token bootstrap");
    return "";
  }
}

export async function api(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "Authorization": `Bearer ${sessionToken}`,
    "Origin": window.location.origin,
  };

  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  try {
    const resp = await fetch(endpoint, { ...options, headers });

    if (resp.status === 423) {
      if (onLockedCallback) onLockedCallback();
      throw new Error("Vault is locked");
    }

    if (resp.status === 428) {
      if (onReauthRequest) {
        const reauthToken = await onReauthRequest();
        if (reauthToken) {
          return api(endpoint, {
            ...options,
            headers: { ...headers, "X-Reauth-Token": reauthToken },
          });
        }
      }
      throw new Error("Re-authentication required");
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || "Request failed");
    }

    const cType = resp.headers.get("content-type");
    if (cType && cType.includes("application/json")) {
      return await resp.json();
    }
    return resp;
  } catch (e) {
    console.error(`API Error ${endpoint}:`, e);
    throw e;
  }
}
