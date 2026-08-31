/* modules/finanzas.js — Módulo Finanzas (formato real: Finanzas.xlsx) */

async function loadFinanzas() {
  try {
    state.finanzas = await apiFetch("/finanzas");
    renderFinanzas();
  } catch (e) { console.error(e); }
}

function renderFinanzas() {
  const filterType = document.getElementById("filter-fin-type")?.value || "";
  let txs = state.finanzas;
  if (filterType) txs = txs.filter(t => t.type === filterType);

  // Totales
  const ingresos = state.finanzas.filter(t => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
  const gastos   = state.finanzas.filter(t => t.type === "gasto").reduce((s, t) => s + t.amount, 0);
  const balance  = ingresos - gastos;

  const fi = document.getElementById("fin-ingresos");
  const fg = document.getElementById("fin-gastos");
  const fb = document.getElementById("fin-balance");
  const fmt = n => `$${Math.abs(n).toLocaleString("es-AR",{minimumFractionDigits:2})}`;
  if (fi) fi.textContent = fmt(ingresos);
  if (fg) fg.textContent = fmt(gastos);
  if (fb) { fb.textContent = fmt(balance); fb.style.color = balance >= 0 ? "var(--emerald)" : "var(--red)"; }

  const tbody = document.getElementById("fin-tbody");
  if (!tbody) return;
  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:32px;">Sin transacciones — importá tu Excel o agrega una</td></tr>`;
    return;
  }
  tbody.innerHTML = txs.map(t => `
    <tr>
      <td style="font-size:.78rem">${escHtml(t.fecha_alta || "")}</td>
      <td style="font-size:.78rem">${escHtml(t.fecha_pago || "")}</td>
      <td>${typeBadge(t.type)}</td>
      <td>${escHtml(t.description)}</td>
      <td style="font-weight:700;color:${t.type==="ingreso"?"var(--emerald)":"var(--red)"}">
        ${t.type==="ingreso"?"+":"-"} $${Number(t.amount).toLocaleString("es-AR",{minimumFractionDigits:2})}
      </td>
      <td>${escHtml(t.category)}</td>
      <td>${escHtml(t.payment_method)}</td>
      <td style="font-size:.76rem;color:var(--text-muted)">${escHtml(t.paid_to || t.notes || "")}</td>
      <td>
        <button class="icon-btn edit" onclick="openEditFinanzaModal(${t.id})" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="icon-btn delete" onclick="deleteFinanza(${t.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join("");
}

function buildFinanzaModal(data = null) {
  document.getElementById("fin-modal-title").textContent = data ? "Editar Transacción" : "Nueva Transacción";
  document.getElementById("fn-id").value           = data?.id || "";
  document.getElementById("fn-type").value         = data?.type || "gasto";
  document.getElementById("fn-fecha-alta").value   = data?.fecha_alta || getTodayDDMMYYYY();
  document.getElementById("fn-fecha-pago").value   = data?.fecha_pago || getTodayDDMMYYYY();
  document.getElementById("fn-desc").value         = data?.description || "";
  document.getElementById("fn-amount").value       = data?.amount ?? "";
  document.getElementById("fn-category").value     = data?.category || "Varios";
  document.getElementById("fn-method").value       = data?.payment_method || "Efectivo";
  document.getElementById("fn-paid-to").value      = data?.paid_to || "";
  document.getElementById("fn-notes").value        = data?.notes || "";
  _toggleFinanzaFields();
  openModal("modal-finanza");
}

function _toggleFinanzaFields() {
  const type = document.getElementById("fn-type")?.value;
  const altaRow = document.getElementById("fn-alta-row");
  const paidRow = document.getElementById("fn-paid-row");
  const notesRow= document.getElementById("fn-notes-row");
  if (altaRow) altaRow.style.display = type === "gasto" ? "" : "none";
  if (paidRow) paidRow.style.display = type === "ingreso" ? "" : "none";
  if (notesRow)notesRow.style.display = type === "gasto" ? "" : "none";
}

function openNewFinanzaModal()       { buildFinanzaModal(); }
function openEditFinanzaModal(id)    { buildFinanzaModal(state.finanzas.find(t => t.id === id)); }

async function submitFinanzaForm() {
  const id = document.getElementById("fn-id").value;
  const type = document.getElementById("fn-type").value;
  const body = {
    type,
    fecha_alta:     type === "gasto" ? (document.getElementById("fn-fecha-alta").value.trim() || null) : null,
    fecha_pago:     document.getElementById("fn-fecha-pago").value.trim(),
    description:    document.getElementById("fn-desc").value.trim(),
    amount:         parseFloat(document.getElementById("fn-amount").value),
    category:       document.getElementById("fn-category").value,
    payment_method: document.getElementById("fn-method").value,
    paid_to:        type === "ingreso" ? (document.getElementById("fn-paid-to").value.trim() || null) : null,
    notes:          type === "gasto"   ? (document.getElementById("fn-notes").value.trim() || null) : null,
  };
  if (!body.description || isNaN(body.amount)) { showToast("Descripción y monto son obligatorios", "error"); return; }
  try {
    if (id) {
      const updated = await apiFetch(`/finanzas/${id}`, "PUT", body);
      const idx = state.finanzas.findIndex(t => t.id === parseInt(id));
      if (idx !== -1) state.finanzas[idx] = updated;
      showToast("Transacción actualizada ✓", "success");
    } else {
      const created = await apiFetch("/finanzas", "POST", body);
      state.finanzas.unshift(created);
      showToast("Transacción guardada ✓", "success");
    }
    closeModal("modal-finanza");
    renderFinanzas();
    loadStats();
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteFinanza(id) {
  if (!confirm("¿Eliminar esta transacción?")) return;
  try {
    await apiFetch(`/finanzas/${id}`, "DELETE");
    state.finanzas = state.finanzas.filter(t => t.id !== id);
    renderFinanzas();
    loadStats();
    showToast("Transacción eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}
