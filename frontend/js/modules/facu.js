/* modules/facu.js — Módulo Facultad (formato real: Facu.xlsx) */

async function loadFacu() {
  try {
    state.facuMaterias = await apiFetch("/facu");
    renderFacu();
  } catch (e) { console.error(e); }
}

function renderFacu() {
  const filterStatus = document.getElementById("filter-facu-status")?.value || "";
  let materias = state.facuMaterias;
  if (filterStatus) materias = materias.filter(m => m.status === filterStatus);

  const stats = {
    total:     state.facuMaterias.length,
    cursando:  state.facuMaterias.filter(m => m.status === "Cursando").length,
    aprobada:  state.facuMaterias.filter(m => m.status === "Aprobada").length,
    regular:   state.facuMaterias.filter(m => m.status === "Regular").length,
    libre:     state.facuMaterias.filter(m => m.status === "Libre").length,
    noCursada: state.facuMaterias.filter(m => m.status === "NoCursada").length,
  };

  const sb = document.getElementById("facu-stats-bar");
  if (sb) sb.innerHTML = `
    <div class="pill">Total: <strong>${stats.total}</strong></div>
    <div class="pill" style="border-color:var(--cyan);color:var(--cyan)">Cursando: <strong>${stats.cursando}</strong></div>
    <div class="pill" style="border-color:var(--emerald);color:var(--emerald)">Aprobadas: <strong>${stats.aprobada}</strong></div>
    <div class="pill" style="border-color:var(--amber);color:var(--amber)">Regulares: <strong>${stats.regular}</strong></div>
    <div class="pill" style="border-color:var(--red);color:var(--red)">Libres: <strong>${stats.libre}</strong></div>
    <div class="pill">Sin cursar: <strong>${stats.noCursada}</strong></div>`;

  const tbody = document.getElementById("facu-tbody");
  if (!tbody) return;
  if (!materias.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:32px;">Sin materias — importá tu Excel o agrega una</td></tr>`;
    return;
  }

  const statusColor = {
    "Aprobada":  "var(--emerald)",
    "Cursando":  "var(--cyan)",
    "Regular":   "var(--amber)",
    "Libre":     "var(--red)",
    "NoCursada": "var(--text-dim)",
  };
  const condColor = {
    "Promo": "var(--emerald)",
    "Final": "var(--amber)",
  };

  tbody.innerHTML = materias.map(m => {
    const sc = statusColor[m.status] || "var(--text-muted)";
    const cc = condColor[m.condition_detail] || "";
    return `<tr>
      <td><strong>${escHtml(m.name)}</strong></td>
      <td style="color:var(--text-muted);font-size:.78rem">${escHtml(m.abbreviation || "—")}</td>
      <td style="color:var(--text-muted)">${escHtml(m.cursado || "")} — Niv. ${escHtml(m.level || "")}</td>
      <td><span class="pill" style="border-color:${sc};color:${sc}">${escHtml(m.status)}</span></td>
      <td>${m.condition_detail
        ? `<span class="pill" style="border-color:${cc||"var(--text-muted)"};color:${cc||"var(--text-muted)"};">${escHtml(m.condition_detail)}</span>`
        : "—"}</td>
      <td style="font-weight:700;color:var(--amber)">${m.grade != null ? m.grade : "—"}</td>
      <td style="font-size:.74rem;color:var(--text-muted)">${escHtml(m.correlativa_cursada || "—")}</td>
      <td style="font-size:.74rem;color:var(--text-muted)">${escHtml(m.correlativa_aprobada || "—")}</td>
      <td>
        <button class="icon-btn edit" onclick="openEditMateriaModal(${m.id})" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="icon-btn delete" onclick="deleteMateria(${m.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join("");
}

function openNewMateriaModal() {
  document.getElementById("facu-modal-title").textContent = "Nueva Materia";
  ["fm-id","fm-name","fm-abbr","fm-corr-c","fm-corr-a","fm-grade","fm-cond"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("fm-cursado").value = "C";
  document.getElementById("fm-level").value   = "I";
  document.getElementById("fm-status").value  = "Cursando";
  openModal("modal-facu");
}

function openEditMateriaModal(id) {
  const m = state.facuMaterias.find(x => x.id === id);
  if (!m) return;
  document.getElementById("facu-modal-title").textContent = "Editar Materia";
  document.getElementById("fm-id").value       = m.id;
  document.getElementById("fm-name").value     = m.name;
  document.getElementById("fm-abbr").value     = m.abbreviation || "";
  document.getElementById("fm-cursado").value  = m.cursado || "C";
  document.getElementById("fm-level").value    = m.level || "I";
  document.getElementById("fm-corr-c").value   = m.correlativa_cursada || "";
  document.getElementById("fm-corr-a").value   = m.correlativa_aprobada || "";
  document.getElementById("fm-status").value   = m.status;
  document.getElementById("fm-grade").value    = m.grade ?? "";
  document.getElementById("fm-cond").value     = m.condition_detail || "";
  openModal("modal-facu");
}

async function submitMateriaForm() {
  const id   = document.getElementById("fm-id").value;
  const body = {
    name:                 document.getElementById("fm-name").value.trim(),
    abbreviation:         document.getElementById("fm-abbr").value.trim() || null,
    cursado:              document.getElementById("fm-cursado").value,
    level:                document.getElementById("fm-level").value,
    correlativa_cursada:  document.getElementById("fm-corr-c").value.trim() || null,
    correlativa_aprobada: document.getElementById("fm-corr-a").value.trim() || null,
    status:               document.getElementById("fm-status").value,
    grade:                document.getElementById("fm-grade").value ? parseFloat(document.getElementById("fm-grade").value) : null,
    condition_detail:     document.getElementById("fm-cond").value.trim() || null,
  };
  if (!body.name) { showToast("El nombre es obligatorio", "error"); return; }
  try {
    if (id) {
      const updated = await apiFetch(`/facu/${id}`, "PUT", body);
      const idx = state.facuMaterias.findIndex(x => x.id === parseInt(id));
      if (idx !== -1) state.facuMaterias[idx] = updated;
      showToast("Materia actualizada ✓", "success");
    } else {
      const created = await apiFetch("/facu", "POST", body);
      state.facuMaterias.push(created);
      showToast("Materia agregada ✓", "success");
    }
    closeModal("modal-facu");
    renderFacu();
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteMateria(id) {
  if (!confirm("¿Eliminar esta materia?")) return;
  try {
    await apiFetch(`/facu/${id}`, "DELETE");
    state.facuMaterias = state.facuMaterias.filter(m => m.id !== id);
    renderFacu();
    showToast("Materia eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}
