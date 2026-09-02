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

function ddmmyyyyToIso(str) {
  if (!str) return "";
  if (str.includes("-")) return str;
  const parts = str.split("/");
  if (parts.length === 3) {
    const d = parts[0].padStart(2, "0");
    const m = parts[1].padStart(2, "0");
    const y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
    return `${y}-${m}-${d}`;
  }
  return "";
}

function isoToDdmmyyyy(str) {
  if (!str) return "";
  if (str.includes("/")) return str;
  const parts = str.split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    return `${d}/${m}/${y}`;
  }
  return str;
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

// ── Sidebar Mobile Toggle ──────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("mobile-sidebar-overlay");
  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("active");
}

function closeSidebarMobile() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("mobile-sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

// ── Navigate tabs ──────────────────────────────────────────
function navigate(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const tab = document.getElementById(`tab-${tabId}`);
  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (tab) tab.classList.add("active");
  if (btn) btn.classList.add("active");

  closeSidebarMobile();

  // Re-renderizar la vista correspondiente al cambiar de pestaña
  if (tabId === "dashboard") {
    if (typeof renderDashboard === "function") renderDashboard();
  } else if (tabId === "board") {
    if (typeof populateBoardFilters === "function") populateBoardFilters();
    if (typeof renderBoard === "function") renderBoard();
  } else if (tabId === "history") {
    if (typeof renderDumpHistory === "function") renderDumpHistory();
  } else if (tabId === "facu") {
    if (typeof renderFacu === "function") renderFacu();
  } else if (tabId === "finanzas") {
    if (typeof renderFinanzas === "function") renderFinanzas();
    if (typeof loadInversiones === "function") loadInversiones();
  } else if (tabId === "pedidos") {
    if (typeof renderPedidos === "function") renderPedidos();
  } else if (tabId === "rules") {
    if (typeof renderRules === "function") renderRules();
  }
}


// ── Badges ──────────────────────────────────────────
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

function getDateStatus(dueDateStr) {
  if (!dueDateStr) return { status: "none", badge: "" };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = dueDateStr.split("/");
  if (parts.length !== 3) return { status: "normal", badge: `<span class="badge-date normal"><i class="far fa-calendar"></i> ${escHtml(dueDateStr)}</span>` };

  const due = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: "overdue", badge: `<span class="badge-date overdue"><i class="fas fa-triangle-exclamation"></i> ¡Vencida! ${escHtml(dueDateStr)}</span>` };
  } else if (diffDays === 0) {
    return { status: "today", badge: `<span class="badge-date today"><i class="fas fa-clock"></i> Vence Hoy (${escHtml(dueDateStr)})</span>` };
  } else if (diffDays <= 3) {
    return { status: "soon", badge: `<span class="badge-date soon"><i class="fas fa-calendar-day"></i> En ${diffDays}d (${escHtml(dueDateStr)})</span>` };
  } else {
    return { status: "normal", badge: `<span class="badge-date normal"><i class="far fa-calendar"></i> ${escHtml(dueDateStr)}</span>` };
  }
}
