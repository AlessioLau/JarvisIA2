/* modules/dump.js — Captura, procesamiento e historial de dumps */

// ══════════════════════════════════════════════════════════
// LIVE PREVIEW — mientras el usuario escribe
// ══════════════════════════════════════════════════════════
function updateLivePreview() {
  const text = document.getElementById("dump-text")?.value || "";
  const container = document.getElementById("live-badges");
  if (!container) return;
  if (!text.trim()) { container.innerHTML = '<span style="color:var(--text-dim);font-size:.8rem;">Escribe algo…</span>'; return; }

  const rules = state.rules;
  const low = text.toLowerCase();
  const found = new Map(); // label → type

  for (const r of rules) {
    if (low.includes(r.keyword.toLowerCase())) {
      found.set(`${r.target_type}: ${r.target_value}`, r.target_type);
    }
  }

  if (!found.size) {
    container.innerHTML = '<span style="color:var(--text-dim);font-size:.8rem;">Sin coincidencias detectadas aún</span>';
    return;
  }

  container.innerHTML = [...found.entries()].map(([label, type]) => {
    const colorMap = { area:"var(--purple)", category:"var(--cyan)", priority:"var(--red)", context:"var(--amber)" };
    const color = colorMap[type] || "var(--primary)";
    return `<span style="background:rgba(99,102,241,.15);border:1px solid ${color};color:${color};border-radius:20px;padding:3px 10px;font-size:.75rem;font-weight:700;">${escHtml(label)}</span>`;
  }).join("");
}

// ══════════════════════════════════════════════════════════
// PROCESAR DUMP
// ══════════════════════════════════════════════════════════
async function processDump() {
  const textarea = document.getElementById("dump-text");
  const text = textarea?.value?.trim();
  if (!text) { showToast("Escribí algo primero", "error"); return; }

  const btn = document.getElementById("btn-process");
  if (btn) btn.disabled = true;

  try {
    // 1. Guardar dump
    const dump = await apiFetch("/dumps", "POST", { text });
    state.pendingDumpId = dump.id;

    // 2. Procesar
    const result = await apiFetch("/dumps/process", "POST", { text, dump_id: dump.id });
    state.pendingExtracted = result.extracted_items.map((it, i) => ({ ...it, _idx: i }));

    renderReview(text);
    navigate("review");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════
// REVIEW — revisión de items extraídos
// ══════════════════════════════════════════════════════════
function renderReview(originalText) {
  const area  = document.getElementById("review-area");
  const items = state.pendingExtracted;
  if (!area) return;

  const catOpts = state.categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join("");
  const areaOpts = ['<option value="">— sin área —</option>',
    ...state.areas.map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`)].join("");

  const banner = `
    <div class="source-banner">
      <div class="icon"><i class="fas fa-file-lines"></i></div>
      <div class="text">${escHtml(originalText)}</div>
    </div>`;

  if (!items.length) {
    area.innerHTML = banner + '<div class="empty"><i class="fas fa-search-minus"></i>No se detectaron tareas. Revisa las reglas de extracción.</div>';
    return;
  }

  const cards = items.map((it) => `
    <div class="review-card ${it.is_ambiguous ? "ambiguous" : ""}" data-idx="${it._idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <input class="input" value="${escHtml(it.title)}" data-field="title" style="flex:1;font-weight:600;">
        <button class="icon-btn delete" onclick="removeReviewItem(${it._idx})" title="Eliminar"><i class="fas fa-trash"></i></button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Categoría</label>
          <select class="select" data-field="category">
            ${catOpts.replace(`value="${escHtml(it.category)}"`, `value="${escHtml(it.category)}" selected`)}
          </select>
        </div>
        <div class="form-group">
          <label>Prioridad</label>
          <select class="select" data-field="priority">
            ${["alta","media","baja"].map(p => `<option value="${p}" ${p===it.priority?"selected":""}>${p}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Área</label>
          <select class="select" data-field="area">
            ${areaOpts.replace(`value="${escHtml(it.area||"")}"`, `value="${escHtml(it.area||"")}" selected`)}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha límite</label>
          <input class="input" type="text" placeholder="dd/mm/aaaa" value="${escHtml(it.due_date||"")}" data-field="due_date">
        </div>
      </div>
      ${it.is_ambiguous ? '<div class="pill" style="font-size:.72rem;color:var(--amber);border-color:var(--amber);"><i class="fas fa-triangle-exclamation"></i> Ítem ambiguo — verifica categoría y área</div>' : ""}
    </div>`).join("");

  area.innerHTML = banner +
    `<div class="review-grid">${cards}</div>` +
    `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
       <button class="btn btn-secondary" onclick="navigate('dump')"><i class="fas fa-arrow-left"></i> Volver</button>
       <button class="btn btn-primary" onclick="approveItems()"><i class="fas fa-check"></i> Guardar todos</button>
     </div>`;

  // Bind change events
  area.querySelectorAll(".review-card").forEach((card) => {
    const idx = parseInt(card.dataset.idx);
    card.querySelectorAll("[data-field]").forEach(el => {
      el.addEventListener("change", () => {
        const it = state.pendingExtracted.find(x => x._idx === idx);
        if (it) it[el.dataset.field] = el.value;
      });
      el.addEventListener("input", () => {
        const it = state.pendingExtracted.find(x => x._idx === idx);
        if (it) it[el.dataset.field] = el.value;
      });
    });
  });
}

function removeReviewItem(idx) {
  state.pendingExtracted = state.pendingExtracted.filter(x => x._idx !== idx);
  // Re-render
  const originalBanner = document.querySelector(".source-banner .text")?.textContent || "";
  renderReview(originalBanner);
}

async function approveItems() {
  if (!state.pendingExtracted.length) { showToast("No hay items para guardar", "error"); return; }
  try {
    await apiFetch("/dumps/approve", "POST", { dump_id: state.pendingDumpId, items: state.pendingExtracted });
    showToast(`✅ ${state.pendingExtracted.length} items guardados`, "success");
    // Reset
    state.pendingExtracted = []; state.pendingDumpId = null;
    document.getElementById("dump-text").value = "";
    document.getElementById("live-badges").innerHTML = "";
    // Recargar tablero
    await loadItems(); loadStats();
    navigate("board");
  } catch (e) { showToast(e.message, "error"); }
}

// ══════════════════════════════════════════════════════════
// HISTORIAL
// ══════════════════════════════════════════════════════════
async function loadDumps() {
  try {
    state.dumps = await apiFetch("/dumps");
    renderDumpHistory();
  } catch (e) { console.error(e); }
}

function renderDumpHistory() {
  const container = document.getElementById("dump-history");
  if (!container) return;
  if (!state.dumps.length) {
    container.innerHTML = '<div class="empty"><i class="fas fa-inbox"></i>Sin historial de dumps</div>';
    return;
  }

  container.innerHTML = state.dumps.map(d => `
    <div class="dump-item">
      <div class="dump-item-body">
        <div class="dump-text">${escHtml(d.original_text)}</div>
        <div class="dump-meta">
          <span><i class="fas fa-clock"></i> ${d.created_at ? d.created_at.replace("T"," ").slice(0,16) : "—"}</span>
          <span class="badge ${d.status === 'processed' ? 'badge-nota' : 'badge-media'}">${d.status}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" data-dump-id="${d.id}" onclick="reprocessDump(${d.id})">
          <i class="fas fa-rotate-right"></i> Reprocesar
        </button>
        <button class="icon-btn delete" onclick="deleteDump(${d.id})" title="Borrar"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join("");
}

async function reprocessDump(dumpId) {
  const dump = state.dumps.find(d => d.id === dumpId);
  if (!dump) return;
  document.getElementById("dump-text").value = dump.original_text;
  navigate("dump");
  updateLivePreview();
  setTimeout(() => { document.getElementById("dump-text")?.scrollIntoView({ behavior: "smooth" }); }, 200);
}

async function deleteDump(dumpId) {
  if (!confirm("¿Eliminar este dump del historial?")) return;
  try {
    await apiFetch(`/dumps/${dumpId}`, "DELETE");
    state.dumps = state.dumps.filter(d => d.id !== dumpId);
    renderDumpHistory();
    showToast("Dump eliminado", "success");
  } catch (e) { showToast(e.message, "error"); }
}
