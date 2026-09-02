/* modules/finanzas.js — Módulo Finanzas e Inversiones */

let selectedFinanzaIds = new Set();

function getVisibleFinanzas() {
  const filterType = document.getElementById("filter-fin-type")?.value || "";
  let txs = state.finanzas || [];
  if (filterType) txs = txs.filter(t => t.type === filterType);
  return txs;
}

function updateFinanzasSelectionUI() {
  const visible = getVisibleFinanzas();
  const visibleIds = visible.map(t => t.id);
  const totalSelected = selectedFinanzaIds.size;

  const batchBar = document.getElementById("fin-batch-bar");
  const countEl = document.getElementById("fin-selected-count");
  if (batchBar) {
    batchBar.style.display = totalSelected > 0 ? "flex" : "none";
  }
  if (countEl) {
    countEl.textContent = totalSelected;
  }

  const selectAll = document.getElementById("fin-select-all");
  if (selectAll) {
    if (visibleIds.length > 0 && visibleIds.every(id => selectedFinanzaIds.has(id))) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    } else if (visibleIds.some(id => selectedFinanzaIds.has(id))) {
      selectAll.checked = false;
      selectAll.indeterminate = true;
    } else {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
  }

  document.querySelectorAll(".fin-row-check").forEach(chk => {
    const id = Number(chk.dataset.id);
    const checked = selectedFinanzaIds.has(id);
    chk.checked = checked;
    const row = chk.closest("tr");
    if (row) {
      row.classList.toggle("fin-row-selected", checked);
    }
  });
}

function toggleSelectAllFinanzas(checked) {
  const visible = getVisibleFinanzas();
  if (checked) {
    visible.forEach(t => selectedFinanzaIds.add(t.id));
  } else {
    visible.forEach(t => selectedFinanzaIds.delete(t.id));
  }
  updateFinanzasSelectionUI();
}

function toggleFinanzaSelection(id, checked) {
  if (checked) {
    selectedFinanzaIds.add(id);
  } else {
    selectedFinanzaIds.delete(id);
  }
  updateFinanzasSelectionUI();
}

function clearFinanzasSelection() {
  selectedFinanzaIds.clear();
  updateFinanzasSelectionUI();
}

async function loadFinanzas() {
  try {
    state.finanzas = await apiFetch("/finanzas");
    renderFinanzas();
  } catch (e) { console.error(e); }
}

async function loadInversiones() {
  try {
    state.inversiones = await apiFetch("/inversiones");
    renderInversiones();
  } catch (e) { console.error(e); }
}

function switchFinanzasSubtab(tabName) {
  document.querySelectorAll(".fin-subtab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.subtab === tabName);
  });
  document.querySelectorAll(".fin-subtab-content").forEach(sec => {
    sec.style.display = sec.id === `fin-subtab-${tabName}` ? "block" : "none";
  });
  if (tabName === "inversiones") {
    renderInversiones();
  } else {
    renderFinanzas();
  }
}

function renderFinanzas() {
  const existingIds = new Set((state.finanzas || []).map(t => t.id));
  for (const id of selectedFinanzaIds) {
    if (!existingIds.has(id)) selectedFinanzaIds.delete(id);
  }

  const filterType = document.getElementById("filter-fin-type")?.value || "";
  let txs = state.finanzas || [];
  if (filterType) txs = txs.filter(t => t.type === filterType);

  // Totales
  const ingresos = (state.finanzas || []).filter(t => t.type === "ingreso").reduce((s, t) => s + Number(t.amount || 0), 0);
  const gastos   = (state.finanzas || []).filter(t => t.type === "gasto").reduce((s, t) => s + Number(t.amount || 0), 0);
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
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-dim);padding:32px;">Sin transacciones — importá tu Excel o agrega una</td></tr>`;
    updateFinanzasSelectionUI();
    return;
  }
  tbody.innerHTML = txs.map(t => {
    const isSelected = selectedFinanzaIds.has(t.id);
    return `
    <tr class="${isSelected ? "fin-row-selected" : ""}">
      <td style="text-align:center;width:38px;">
        <input type="checkbox" class="fin-check-input fin-row-check" data-id="${t.id}" ${isSelected ? "checked" : ""} onchange="toggleFinanzaSelection(${t.id}, this.checked)">
      </td>
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
    </tr>`;
  }).join("");

  updateFinanzasSelectionUI();
}

// ── Inversiones Render ─────────────────────────────────────
function renderInversiones() {
  const tbody = document.getElementById("inv-tbody");
  if (!tbody) return;

  const invs = state.inversiones || [];

  // Totales
  const totalVal = invs.reduce((s, i) => s + Number(i.current_val || (i.buy_price * i.quantity) || 0), 0);
  const totalCost = invs.reduce((s, i) => s + Number((i.buy_price * i.quantity) || 0), 0);
  const totalProfit = totalVal - totalCost;

  const tvEl = document.getElementById("inv-total-val");
  const tpEl = document.getElementById("inv-total-profit");
  if (tvEl) tvEl.textContent = `$${totalVal.toLocaleString("es-AR", {minimumFractionDigits:2})}`;
  if (tpEl) {
    tpEl.textContent = `${totalProfit >= 0 ? "+" : ""}$${totalProfit.toLocaleString("es-AR", {minimumFractionDigits:2})}`;
    tpEl.style.color = totalProfit >= 0 ? "var(--emerald)" : "var(--red)";
  }

  if (!invs.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:32px;">Sin inversiones registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = invs.map(inv => {
    const buyPrice = Number(inv.buy_price || 0);
    const qty = Number(inv.quantity || 0);
    const cost = buyPrice * qty;
    const currentVal = Number(inv.current_val || cost);
    const diff = currentVal - cost;

    return `
      <tr>
        <td style="font-size:.78rem">${escHtml(inv.fecha || "")}</td>
        <td><strong>${escHtml(inv.description)}</strong></td>
        <td><span class="badge" style="background:rgba(99,102,241,.2);color:var(--primary)">${escHtml(inv.platform || "—")}</span></td>
        <td>$${buyPrice.toLocaleString("es-AR", {minimumFractionDigits:2})}</td>
        <td>${qty}</td>
        <td style="font-weight:700">$${currentVal.toLocaleString("es-AR", {minimumFractionDigits:2})}</td>
        <td style="font-weight:600;color:${diff >= 0 ? "var(--emerald)" : "var(--red)"}">
          ${diff >= 0 ? "+" : ""}$${diff.toLocaleString("es-AR", {minimumFractionDigits:2})}
        </td>
        <td>
          <button class="icon-btn delete" onclick="deleteInversion(${inv.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
  }).join("");
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
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteFinanza(id) {
  if (!confirm("¿Eliminar esta transacción?")) return;
  try {
    await apiFetch(`/finanzas/${id}`, "DELETE");
    selectedFinanzaIds.delete(id);
    state.finanzas = state.finanzas.filter(t => t.id !== id);
    renderFinanzas();
    loadStats();
    if (typeof renderDashboard === "function") renderDashboard();
    showToast("Transacción eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteSelectedFinanzas() {
  const ids = Array.from(selectedFinanzaIds);
  if (!ids.length) return;

  const msg = ids.length === 1
    ? "¿Eliminar la transacción seleccionada?"
    : `¿Eliminar las ${ids.length} transacciones seleccionadas?`;

  if (!confirm(msg)) return;

  try {
    try {
      await apiFetch("/finanzas/batch-delete", "POST", { ids });
    } catch (err) {
      console.warn("Fallo batch-delete en backend, reintentando individualmente:", err);
      await Promise.all(ids.map(id => apiFetch(`/finanzas/${id}`, "DELETE")));
    }

    const idSet = new Set(ids);
    state.finanzas = (state.finanzas || []).filter(t => !idSet.has(t.id));
    selectedFinanzaIds.clear();

    renderFinanzas();
    loadStats();
    if (typeof renderDashboard === "function") renderDashboard();
    showToast(`${ids.length} transacción(es) eliminada(s) ✓`, "success");
  } catch (e) {
    showToast(e.message || "Error al eliminar transacciones", "error");
  }
}

// ── Inversiones Modales y CRUD ─────────────────────────────
function openNewInversionModal() {
  document.getElementById("inv-fecha").value = getTodayDDMMYYYY();
  document.getElementById("inv-desc").value = "";
  document.getElementById("inv-platform").value = "";
  document.getElementById("inv-buy-price").value = "";
  document.getElementById("inv-qty").value = "";
  document.getElementById("inv-curr-val").value = "";
  openModal("modal-inversion");
}

async function submitInversionForm() {
  const body = {
    fecha: document.getElementById("inv-fecha").value.trim() || getTodayDDMMYYYY(),
    description: document.getElementById("inv-desc").value.trim(),
    platform: document.getElementById("inv-platform").value.trim() || null,
    buy_price: parseFloat(document.getElementById("inv-buy-price").value) || null,
    quantity: parseFloat(document.getElementById("inv-qty").value) || null,
    current_val: parseFloat(document.getElementById("inv-curr-val").value) || null,
  };

  if (!body.description) {
    showToast("La descripción es obligatoria", "error");
    return;
  }

  try {
    const created = await apiFetch("/inversiones", "POST", body);
    state.inversiones.unshift(created);
    closeModal("modal-inversion");
    renderInversiones();
    showToast("Inversión registrada ✓", "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteInversion(id) {
  if (!confirm("¿Eliminar este registro de inversión?")) return;
  try {
    await apiFetch(`/inversiones/${id}`, "DELETE");
    state.inversiones = state.inversiones.filter(i => i.id !== id);
    renderInversiones();
    showToast("Inversión eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}
