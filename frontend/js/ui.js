/* ui.js — Helpers de UI para JarvisIA2 */

function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getTodayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// ── Toast ──────────────────────────────────────────────────
let _toastWrap = null;
function showToast(msg, type = "info") {
  if (!_toastWrap) {
    _toastWrap = document.createElement("div");
    _toastWrap.className = "toast-wrap";
    document.body.appendChild(_toastWrap);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const icons = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info" };
  t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escHtml(msg)}`;
  _toastWrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── Modal ──────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = "grid"; el.offsetHeight; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

// Click outside to close
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.style.display = "none";
  }
});

// ── Navigate tabs ──────────────────────────────────────────
function navigate(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const tab = document.getElementById(`tab-${tabId}`);
  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (tab) tab.classList.add("active");
  if (btn) btn.classList.add("active");
}

// ── Category badge ──────────────────────────────────────────
function catBadge(cat) {
  const safe = (cat || "tarea").toLowerCase().replace(/\s/g, "-");
  return `<span class="badge badge-${safe}">${escHtml(cat || "tarea")}</span>`;
}

function prioBadge(p) {
  const safe = (p || "media").toLowerCase();
  return `<span class="badge badge-${safe}">${escHtml(p || "media")}</span>`;
}

function typeBadge(type) {
  const safe = (type || "gasto").toLowerCase();
  return `<span class="badge badge-${safe}">${escHtml(type)}</span>`;
}
