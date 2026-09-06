const API = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port !== "" && window.location.port !== "8000"
  ? "http://127.0.0.1:8000/api"
  : `${window.location.origin}/api`;


function _getHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  return headers;
}

function _handleAuthError(res) {
  if (res.status === 401) {
    console.warn("Sesión inválida o expirada. Solicitando autenticación.");
    if (typeof openAuthModal === "function") {
      openAuthModal();
    }
  }
}

async function apiFetch(path, method = "GET", body = null, queryParams = {}) {
  const url = new URL(`${API}${path}`);
  // Si admin tiene un filtro específico seleccionado, usarlo; sino su propio userId
  const effectiveUserId = (state.user?.role === "admin" && state.filterUserId) ? state.filterUserId : state.userId;
  if (effectiveUserId) {
    url.searchParams.set("user_id", effectiveUserId);
  }
  Object.entries(queryParams).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const opts = { method, headers: _getHeaders(true) };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    _handleAuthError(res);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiUpload(path, formData) {
  const url = new URL(`${API}${path}`);
  const effectiveUserId = (state.user?.role === "admin" && state.filterUserId) ? state.filterUserId : state.userId;
  if (effectiveUserId) {
    url.searchParams.set("user_id", effectiveUserId);
  }
  const opts = { method: "POST", headers: _getHeaders(false), body: formData };
  const res = await fetch(url, opts);
  if (!res.ok) {
    _handleAuthError(res);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function apiDownload(path, filename) {
  const url = new URL(`${API}${path}`);
  const effectiveUserId = (state.user?.role === "admin" && state.filterUserId) ? state.filterUserId : state.userId;
  if (effectiveUserId) {
    url.searchParams.set("user_id", effectiveUserId);
  }
  if (state.token) {
    // Si la descarga es por <a>, se le puede pasar el token si fuera necesario
    url.searchParams.set("token", state.token);
  }
  const a = document.createElement("a");
  a.href = url.toString(); a.download = filename; a.click();
}

