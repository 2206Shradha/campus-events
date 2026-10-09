// Thin wrapper around fetch(): attaches the JWT, parses JSON, throws ApiError on failure.
const TOKEN_KEY = 'campus_events_token';

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || {};
  }
}

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable (private mode) – session lasts until reload */ }
  },
};

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString()
    : '';
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(`/api${path}${qs}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.", 'NETWORK');
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }

  if (!res.ok) {
    const err = data?.error || {};
    if (res.status === 401 && session.token && err.code === 'UNAUTHORIZED') {
      session.token = null; // expired / invalid token
      window.dispatchEvent(new Event('auth-changed'));
    }
    throw new ApiError(res.status, err.message || `Request failed (${res.status})`, err.code, err.details);
  }
  return data;
}
