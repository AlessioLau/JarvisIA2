const API = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port !== "" && window.location.port !== "8000"
  ? "http://127.0.0.1:8000/api"
  : `${window.location.origin}/api`;


async function apiFetch(path, method = "GET", body = null, queryParams = {}) {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("user_id", state.userId);
  Object.entries(queryParams).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiUpload(path, formData) {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("user_id", state.userId);
  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function apiDownload(path, filename) {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("user_id", state.userId);
  const a = document.createElement("a");
  a.href = url.toString(); a.download = filename; a.click();
}
