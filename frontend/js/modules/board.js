/* modules/board.js — Tablero Kanban */

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
    pendiente:    { id: "col-pend",    label: "Pendiente",    icon: "fa-circle", color: "var(--amber)"  },
    "en progreso":{ id: "col-prog",    label: "En Progreso",  icon: "fa-spinner", color: "var(--cyan)"  },
    completado:   { id: "col-comp",    label: "Completado",   icon: "fa-circle-check", color: "var(--emerald)" },
  };

  Object.entries(cols).forEach(([status, conf]) => {
    const col = document.getElementById(conf.id);
    if (!col) return;
    const filtered = items.filter(i => i.status === status);
    document.getElementById(conf.id + "-count")?.setAttribute("data-count", filtered.length);

    const countEl = col.closest(".kanban-col")?.querySelector(".count");
    if (countEl) countEl.textContent = filtered.length;

    const body = col.querySelector(".kanban-body");
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = '<div class="empty"><i class="fas fa-inbox"></i>Sin tareas</div>';
      return;
    }
    body.innerHTML = filtered.map(item => `
      <div class="task-card">
        <div class="task-card-title">${escHtml(item.title)}</div>
        <div class="task-card-meta">
          ${catBadge(item.category)} ${prioBadge(item.priority)}
          ${item.area ? `<span><i class="fas fa-map-pin"></i> ${escHtml(item.area)}</span>` : ""}
          ${item.due_date ? `<span><i class="fas fa-calendar"></i> ${escHtml(item.due_date)}</span>` : ""}
        </div>
        <div class="task-card-actions">
          <button class="icon-btn edit" onclick="openEditItemModal(${item.id})" title="Editar"><i class="fas fa-pen"></i></button>
          <button class="icon-btn delete" onclick="deleteItem(${item.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join("");
  });
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
      <div class="form-group"><label>Fecha límite</label><input id="ei-due" class="input" placeholder="dd/mm/aaaa" value="${escHtml(item.due_date||"")}"></div>
    </div>
    <div class="form-group"><label>Notas</label><textarea id="ei-notes" class="input" rows="2">${escHtml(item.notes||"")}</textarea></div>
    <input type="hidden" id="ei-id" value="${item.id}">`;
  openModal("modal-edit-item");
}

async function submitEditItem() {
  const id = parseInt(document.getElementById("ei-id").value);
  const body = {
    title:    document.getElementById("ei-title").value.trim(),
    category: document.getElementById("ei-cat").value,
    status:   document.getElementById("ei-status").value,
    priority: document.getElementById("ei-priority").value,
    area:     document.getElementById("ei-area").value || null,
    due_date: document.getElementById("ei-due").value.trim() || null,
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
  } catch (e) { showToast(e.message, "error"); }
}
