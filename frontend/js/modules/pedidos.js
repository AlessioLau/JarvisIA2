/* modules/pedidos.js — Módulo Pedidos 3D (formato real: Pedidos3D.xlsx) */

const PEDIDO_ESTADOS = ["Diseño","Imprimiendo","Post-proceso","Pintado","Listo","Entregado","Cancelado"];

async function loadPedidos() {
  try {
    state.pedidos = await apiFetch("/pedidos");
    renderPedidos();
  } catch (e) { console.error(e); }
}

function renderPedidos() {
  const filterStatus = document.getElementById("filter-pedido-status")?.value || "";
  let pedidos = state.pedidos;
  if (filterStatus === "pendientes") {
    pedidos = pedidos.filter(p => !["Entregado", "Cancelado"].includes(p.status));
  } else if (filterStatus) {
    pedidos = pedidos.filter(p => p.status === filterStatus);
  }

  const container = document.getElementById("pedidos-list");
  if (!container) return;
  if (!pedidos.length) {
    container.innerHTML = '<div class="empty"><i class="fas fa-cube"></i>Sin pedidos — importá tu Excel o crea uno</div>';
    return;
  }

  const statusColor = {
    "Diseño":       "var(--purple)",
    "Imprimiendo":  "var(--cyan)",
    "Post-proceso": "var(--amber)",
    "Pintado":      "var(--pink)",
    "Listo":        "var(--primary)",
    "Entregado":    "var(--emerald)",
    "Cancelado":    "var(--red)",
  };

  container.innerHTML = pedidos.map(p => {
    const color = statusColor[p.status] || "var(--text-muted)";
    return `
    <div class="pedido-card">
      <div class="pedido-info">
        <div class="client"><i class="fas fa-user" style="color:var(--text-muted)"></i> <strong>${escHtml(p.client)}</strong>
          ${p.seller ? `<span style="color:var(--text-muted);font-size:.78rem;margin-left:8px;">via ${escHtml(p.seller)}</span>` : ""}
        </div>
        <div class="product"><i class="fas fa-cube" style="color:var(--pink)"></i> ${escHtml(p.product)}</div>
        <div class="meta">
          <span style="color:${color};border:1px solid ${color};border-radius:12px;padding:1px 8px;font-size:.72rem;">${escHtml(p.status)}</span>
          ${p.priority ? prioBadge(p.priority) : ""}
          ${p.price ? `<span><i class="fas fa-tag"></i> $${Number(p.price).toLocaleString("es-AR")}</span>` : ""}
          ${p.order_date ? `<span><i class="fas fa-calendar"></i> ${escHtml(p.order_date)}</span>` : ""}
          ${p.delivery_date ? `<span><i class="fas fa-truck"></i> ${escHtml(p.delivery_date)}</span>` : ""}
          ${p.time_str ? `<span><i class="fas fa-clock"></i> ${escHtml(p.time_str)}</span>` : ""}
          ${p.grams_str ? `<span><i class="fas fa-weight-scale"></i> ${escHtml(p.grams_str)}</span>` : ""}
        </div>
        ${p.notes ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:3px;"><i class="fas fa-sticky-note"></i> ${escHtml(p.notes)}</div>` : ""}
      </div>
      <div class="pedido-actions">
        <select class="select" style="font-size:.76rem;padding:4px 8px;" onchange="updatePedidoStatus(${p.id}, this.value)">
          ${PEDIDO_ESTADOS.map(s => `<option value="${s}" ${s===p.status?"selected":""}>${s}</option>`).join("")}
        </select>
        <button class="icon-btn edit" onclick="openEditPedidoModal(${p.id})" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="icon-btn delete" onclick="deletePedido(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join("");
}

async function updatePedidoStatus(id, newStatus) {
  const p = state.pedidos.find(x => x.id === id);
  if (!p) return;
  const body = {
    client: p.client, seller: p.seller, product: p.product,
    order_date: p.order_date, delivery_date: p.delivery_date,
    price: p.price, time_str: p.time_str, grams_str: p.grams_str,
    hours: p.hours, status: newStatus, priority: p.priority, notes: p.notes,
  };
  try {
    const updated = await apiFetch(`/pedidos/${id}`, "PUT", body);
    const idx = state.pedidos.findIndex(x => x.id === id);
    if (idx !== -1) state.pedidos[idx] = updated;
    renderPedidos();
    showToast(`Estado → ${newStatus}`, "success");
    loadStats();
  } catch (e) { showToast(e.message, "error"); }
}

function buildPedidoModal(data = null) {
  document.getElementById("ped-modal-title").textContent = data ? "Editar Pedido" : "Nuevo Pedido";
  document.getElementById("ped-id").value            = data?.id || "";
  document.getElementById("ped-client").value        = data?.client || "";
  document.getElementById("ped-seller").value        = data?.seller || "";
  document.getElementById("ped-product").value       = data?.product || "";
  document.getElementById("ped-order-date").value    = data?.order_date || getTodayDDMMYYYY();
  document.getElementById("ped-delivery-date").value = data?.delivery_date || "";
  document.getElementById("ped-price").value         = data?.price ?? "";
  document.getElementById("ped-time-str").value      = data?.time_str || "";
  document.getElementById("ped-grams-str").value     = data?.grams_str || "";
  document.getElementById("ped-hours").value         = data?.hours ?? "";
  document.getElementById("ped-status").value        = data?.status || "Diseño";
  document.getElementById("ped-priority").value      = data?.priority || "media";
  document.getElementById("ped-notes").value         = data?.notes || "";
  openModal("modal-pedido");
}

function openNewPedidoModal()     { buildPedidoModal(); }
function openEditPedidoModal(id)  { buildPedidoModal(state.pedidos.find(p => p.id === id)); }

async function submitPedidoForm() {
  const id = document.getElementById("ped-id").value;
  const body = {
    client:        document.getElementById("ped-client").value.trim(),
    seller:        document.getElementById("ped-seller").value.trim() || null,
    product:       document.getElementById("ped-product").value.trim(),
    order_date:    document.getElementById("ped-order-date").value.trim(),
    delivery_date: document.getElementById("ped-delivery-date").value.trim() || null,
    price:         document.getElementById("ped-price").value ? parseFloat(document.getElementById("ped-price").value) : null,
    time_str:      document.getElementById("ped-time-str").value.trim() || null,
    grams_str:     document.getElementById("ped-grams-str").value.trim() || null,
    hours:         document.getElementById("ped-hours").value ? parseFloat(document.getElementById("ped-hours").value) : null,
    status:        document.getElementById("ped-status").value,
    priority:      document.getElementById("ped-priority").value,
    notes:         document.getElementById("ped-notes").value.trim() || null,
  };
  if (!body.client || !body.product || !body.order_date) {
    showToast("Cliente, producto y fecha son obligatorios", "error"); return;
  }
  try {
    if (id) {
      const updated = await apiFetch(`/pedidos/${id}`, "PUT", body);
      const idx = state.pedidos.findIndex(p => p.id === parseInt(id));
      if (idx !== -1) state.pedidos[idx] = updated;
      showToast("Pedido actualizado ✓", "success");
    } else {
      const created = await apiFetch("/pedidos", "POST", body);
      state.pedidos.unshift(created);
      showToast("Pedido creado ✓", "success");
    }
    closeModal("modal-pedido");
    renderPedidos();
    loadStats();
  } catch (e) { showToast(e.message, "error"); }
}

async function deletePedido(id) {
  if (!confirm("¿Eliminar este pedido?")) return;
  try {
    await apiFetch(`/pedidos/${id}`, "DELETE");
    state.pedidos = state.pedidos.filter(p => p.id !== id);
    renderPedidos();
    showToast("Pedido eliminado", "success");
    loadStats();
  } catch (e) { showToast(e.message, "error"); }
}

// ── Calculadora 3D ──────────────────────────────────
function calcularCosto() {
  const grams  = parseFloat(document.getElementById("calc-grams")?.value) || 0;
  const hours  = parseFloat(document.getElementById("calc-hours")?.value) || 0;
  const pKg    = parseFloat(document.getElementById("calc-pkilo")?.value) || 17000;
  const kwh    = parseFloat(document.getElementById("calc-kwh")?.value)   || 350;
  const cons   = parseFloat(document.getElementById("calc-cons")?.value)  || 0.15;
  const margin = parseFloat(document.getElementById("calc-margin")?.value)|| 30;

  const materia  = grams * (pKg / 1000);         // costo filamento
  const energia  = hours * cons * kwh;            // costo energía
  const subtotal = materia + energia;
  const ganancia = subtotal * margin / 100;
  const total    = subtotal + ganancia;

  const el = id => document.getElementById(id);
  if (el("calc-mat"))     el("calc-mat").textContent     = `$${materia.toFixed(2)}`;
  if (el("calc-energy"))  el("calc-energy").textContent  = `$${energia.toFixed(2)}`;
  if (el("calc-sub"))     el("calc-sub").textContent     = `$${subtotal.toFixed(2)}`;
  if (el("calc-total"))   el("calc-total").textContent   = `$${total.toFixed(2)}`;
}
