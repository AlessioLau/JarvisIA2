/* modules/board.js — Tablero Kanban con HTML5 Drag & Drop */

async function loadItems() {
  try {
    state.items = await apiFetch("/items");
    renderBoard();
  } catch (e) { console.error(e); }
}

function renderBoard() {
  const cat  = document.getElementById("filter-board-cat")?.value || "";
  const area = document.getElementById("filter-board-area")?.value || "";
  let items  = state.items;
  if (cat)  items = items.filter(i => i.category === cat);
  if (area) items = items.filter(i => i.area === area);

  const cols = {
    pendiente:    { id: "col-pend", statusVal: "pendiente", label: "Pendiente" },
    "en progreso":{ id: "col-prog", statusVal: "en progreso", label: "En Progreso" },
    completado:   { id: "col-comp", statusVal: "completado", label: "Completado" },
  };

  Object.entries(cols).forEach(([statusKey, conf]) => {
    const body = document.getElementById(conf.id);
    if (!body) return;

    // Configurar columna como zona de soltado
    body.setAttribute("data-status", conf.statusVal);
    body.ondragover = handleDragOver;
    body.ondragenter = handleDragEnter;
    body.ondragleave = handleDragLeave;
    body.ondrop = handleDrop;

    const filtered = items.filter(i => (i.status || "").toLowerCase() === statusKey.toLowerCase());

    const countEl = body.closest(".kanban-col")?.querySelector(".count");
    if (countEl) countEl.textContent = filtered.length;

    if (!filtered.length) {
      body.innerHTML = '<div class="empty"><i class="fas fa-inbox"></i>Sin tareas</div>';
      return;
    }

    body.innerHTML = filtered.map(item => {
      const dateInfo = getDateStatus(item.due_date);
      return `
        <div class="task-card" draggable="true" ondragstart="handleDragStart(event, ${item.id})">
          <div class="task-card-title">${escHtml(item.title)}</div>
          <div class="task-card-meta">
            ${catBadge(item.category)} ${prioBadge(item.priority)}
            ${item.area ? `<span><i class="fas fa-map-pin"></i> ${escHtml(item.area)}</span>` : ""}
            ${dateInfo.badge}
          </div>
          <div class="task-card-actions">
            <button class="icon-btn edit" onclick="openEditItemModal(${item.id})" title="Editar"><i class="fas fa-pen"></i></button>
            <button class="icon-btn delete" onclick="deleteItem(${item.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join("");
  });
}

// ── HTML5 Drag & Drop Handlers ───────────────────────
let draggedItemId = null;

function handleDragStart(e, itemId) {
  draggedItemId = itemId;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", itemId);
  e.target.classList.add("dragging");
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  return false;
}

function handleDragEnter(e) {
  const col = e.currentTarget;
  if (col) col.classList.add("drag-over");
}

function handleDragLeave(e) {
  const col = e.currentTarget;
  if (col) col.classList.remove("drag-over");
}

async function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  e.preventDefault();

  const col = e.currentTarget;
  if (col) col.classList.remove("drag-over");

  const targetStatus = col.getAttribute("data-status");
  if (!draggedItemId || !targetStatus) return;

  const item = state.items.find(i => i.id === draggedItemId);
  if (!item || item.status === targetStatus) return;

  const oldStatus = item.status;
  item.status = targetStatus; // optimistically update local
  renderBoard();

  try {
    const updated = await apiFetch(`/items/${draggedItemId}`, "PUT", { status: targetStatus });
    const idx = state.items.findIndex(i => i.id === draggedItemId);
    if (idx !== -1) state.items[idx] = updated;
    showToast(`Tarea movida a ${targetStatus} ✓`, "success");
    loadStats();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    item.status = oldStatus; // rollback
    renderBoard();
    showToast("Error al mover la tarea", "error");
  } finally {
    draggedItemId = null;
  }
}

function populateBoardFilters() {
  const catSel  = document.getElementById("filter-board-cat");
  const areaSel = document.getElementById("filter-board-area");
  if (!catSel || !areaSel) return;

  catSel.innerHTML  = '<option value="">Todas las categorías</option>' +
    state.categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join("");
  areaSel.innerHTML = '<option value="">Todas las áreas</option>' +
    state.areas.map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`).join("");
}

// ── Edit item modal ─────────────────────────────────
function openEditItemModal(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const catOpts  = state.categories.map(c => `<option value="${escHtml(c.name)}" ${c.name===item.category?"selected":""}>${escHtml(c.name)}</option>`).join("");
  const areaOpts = ['<option value="">— sin área —</option>',...state.areas.map(a => `<option value="${escHtml(a.name)}" ${a.name===item.area?"selected":""}>${escHtml(a.name)}</option>`)].join("");

  document.getElementById("edit-item-body").innerHTML = `
    <div class="form-group"><label>Título</label><input id="ei-title" class="input" value="${escHtml(item.title)}"></div>
    <div class="form-row">
      <div class="form-group"><label>Categoría</label><select id="ei-cat" class="select">${catOpts}</select></div>
      <div class="form-group"><label>Estado</label>
        <select id="ei-status" class="select">
          ${["pendiente","en progreso","completado"].map(s => `<option value="${s}" ${s===item.status?"selected":""}>${s}</option>`).join("")}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Prioridad</label>
        <select id="ei-priority" class="select">
          ${["alta","media","baja"].map(p => `<option value="${p}" ${p===item.priority?"selected":""}>${p}</option>`).join("")}
        </select></div>
      <div class="form-group"><label>Área</label><select id="ei-area" class="select">${areaOpts}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Fecha límite</label>
        <div style="position:relative; display:flex; align-items:center;">
          <input id="ei-due" class="input" placeholder="Seleccionar fecha..." value="${escHtml(item.due_date||"")}" style="cursor:pointer; padding-right:38px;">
          <i class="fas fa-calendar-alt" style="position:absolute; right:14px; pointer-events:none; color:var(--primary); font-size:.95rem;"></i>
        </div>
      </div>
    </div>
    <div class="form-group"><label>Notas</label><textarea id="ei-notes" class="input" rows="2">${escHtml(item.notes||"")}</textarea></div>
    <input type="hidden" id="ei-id" value="${item.id}">`;
  openModal("modal-edit-item");

  if (typeof flatpickr !== "undefined") {
    flatpickr("#ei-due", {
      dateFormat: "d/m/Y",
      locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.es) ? flatpickr.l10ns.es : "es",
      allowInput: true,
      theme: "dark",
    });
  }
}

async function submitEditItem() {
  const id = parseInt(document.getElementById("ei-id").value);
  const dueVal = document.getElementById("ei-due").value.trim();
  const body = {
    title:    document.getElementById("ei-title").value.trim(),
    category: document.getElementById("ei-cat").value,
    status:   document.getElementById("ei-status").value,
    priority: document.getElementById("ei-priority").value,
    area:     document.getElementById("ei-area").value || null,
    due_date: dueVal || null,
    notes:    document.getElementById("ei-notes").value.trim() || null,
  };
  if (!body.title) { showToast("El título es obligatorio", "error"); return; }
  try {
    const updated = await apiFetch(`/items/${id}`, "PUT", body);
    const idx = state.items.findIndex(i => i.id === id);
    if (idx !== -1) state.items[idx] = updated;
    closeModal("modal-edit-item");
    renderBoard();
    showToast("Tarea actualizada ✓", "success");
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteItem(id) {
  if (!confirm("¿Eliminar esta tarea?")) return;
  try {
    await apiFetch(`/items/${id}`, "DELETE");
    state.items = state.items.filter(i => i.id !== id);
    renderBoard();
    showToast("Tarea eliminada", "success");
    loadStats();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (e) { showToast(e.message, "error"); }
}
