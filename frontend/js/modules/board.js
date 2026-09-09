/* modules/board.js — Tablero Kanban con HTML5 Drag & Drop */

async function loadItems() {
  try {
    state.items = await apiFetch("/items");
    renderBoard();
  } catch (e) { console.error(e); }
}

// Helper para gestionar adjuntos locales por ID de tarea
function getItemFiles(itemId) {
  try {
    const raw = localStorage.getItem(`task_files_${itemId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveItemFiles(itemId, files) {
  try {
    localStorage.setItem(`task_files_${itemId}`, JSON.stringify(files));
  } catch (e) {
    console.error("Error al guardar archivos de la tarea:", e);
  }
}

let tempEditingFiles = [];

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
      const isCompleted = item.status === "completado";
      const dateInfo = getDateStatus(item.due_date, isCompleted);
      const files = getItemFiles(item.id);

      return `
        <div class="task-card" draggable="true" ondragstart="handleDragStart(event, ${item.id})">
          <div class="task-card-title">${escHtml(item.title)}</div>
          <div class="task-card-meta">
            ${catBadge(item.category)} ${prioBadge(item.priority)}
            ${item.area ? `<span><i class="fas fa-map-pin"></i> ${escHtml(item.area)}</span>` : ""}
            ${dateInfo.badge}
          </div>

          ${item.notes ? `
            <div class="task-card-notes" title="Anotaciones">
              <i class="fas fa-note-sticky"></i>${escHtml(item.notes)}
            </div>
          ` : ""}

          ${files.length ? `
            <div class="task-card-files">
              ${files.map((f, idx) => `
                <a class="task-file-pill" href="${f.data}" download="${escHtml(f.name)}" title="Descargar ${escHtml(f.name)} (${f.size || ''})" onclick="event.stopPropagation()">
                  <i class="${getFileIconClass(f.name)}"></i>
                  <span>${escHtml(truncateFileName(f.name, 18))}</span>
                </a>
              `).join("")}
            </div>
          ` : ""}

          <div class="task-card-actions">
            <button class="icon-btn edit" onclick="openEditItemModal(${item.id})" title="Editar y Adjuntar archivos"><i class="fas fa-pen"></i></button>
            <button class="icon-btn delete" onclick="deleteItem(${item.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join("");
  });
}

function truncateFileName(name, maxLen = 20) {
  if (!name || name.length <= maxLen) return name;
  const extIndex = name.lastIndexOf(".");
  if (extIndex > -1 && extIndex > name.length - 6) {
    const ext = name.slice(extIndex);
    const base = name.slice(0, extIndex);
    return base.slice(0, maxLen - ext.length - 3) + "..." + ext;
  }
  return name.slice(0, maxLen - 3) + "...";
}

function getFileIconClass(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "fas fa-file-image";
  if (["pdf"].includes(ext)) return "fas fa-file-pdf";
  if (["doc", "docx"].includes(ext)) return "fas fa-file-word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "fas fa-file-excel";
  if (["zip", "rar", "7z", "tar"].includes(ext)) return "fas fa-file-zipper";
  if (["txt", "md"].includes(ext)) return "fas fa-file-lines";
  return "fas fa-file";
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

// ── Nueva tarea directa ─────────────────────────────
function openNewItemModal() {
  const catOpts  = state.categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join("");
  const areaOpts = ['<option value="">— sin área —</option>',...state.areas.map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`)].join("");

  tempEditingFiles = [];

  document.getElementById("edit-item-modal-title").innerHTML = '<i class="fas fa-plus"></i> Nueva Tarea';
  document.getElementById("edit-item-body").innerHTML = `
    <div class="form-group"><label>Título *</label><input id="ei-title" class="input" placeholder="Nombre de la tarea"></div>
    <div class="form-row">
      <div class="form-group"><label>Categoría</label><select id="ei-cat" class="select">${catOpts}</select></div>
      <div class="form-group"><label>Estado</label>
        <select id="ei-status" class="select">
          ${["pendiente","en progreso","completado"].map(s => `<option value="${s}">${s}</option>`).join("")}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Prioridad</label>
        <select id="ei-priority" class="select">
          ${["alta","media","baja"].map(p => `<option value="${p}" ${p==="media"?"selected":""}>${p}</option>`).join("")}
        </select></div>
      <div class="form-group"><label>Área</label><select id="ei-area" class="select">${areaOpts}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Fecha límite</label>
        <div style="position:relative; display:flex; align-items:center;">
          <input id="ei-due" class="input" placeholder="Seleccionar fecha..." style="cursor:pointer; padding-right:38px;">
          <i class="fas fa-calendar-alt" style="position:absolute; right:14px; pointer-events:none; color:var(--primary); font-size:.95rem;"></i>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label><i class="fas fa-note-sticky" style="color:var(--cyan)"></i> Anotaciones / Observaciones</label>
      <textarea id="ei-notes" class="input" rows="3" placeholder="Escribí notas, detalles, links o apuntes de esta tarea..."></textarea>
    </div>
    <div class="form-group">
      <label><i class="fas fa-paperclip" style="color:var(--pink)"></i> Archivos adjuntos</label>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
          <i class="fas fa-upload"></i> Seleccionar archivo de la PC
          <input type="file" id="ei-file-input" style="display:none" onchange="handleTaskFileUpload(this)">
        </label>
        <span id="ei-file-status" style="font-size:0.75rem;color:var(--text-dim);">Formatos: PDF, imágenes, docs, etc.</span>
      </div>
      <div id="ei-files-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
    </div>
    <input type="hidden" id="ei-id" value="0">`;
  
  renderModalFilesList();
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

// ── Edit item modal ─────────────────────────────────
function openEditItemModal(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const catOpts  = state.categories.map(c => `<option value="${escHtml(c.name)}" ${c.name===item.category?"selected":""}>${escHtml(c.name)}</option>`).join("");
  const areaOpts = ['<option value="">— sin área —</option>',...state.areas.map(a => `<option value="${escHtml(a.name)}" ${a.name===item.area?"selected":""}>${escHtml(a.name)}</option>`)].join("");

  tempEditingFiles = getItemFiles(item.id);

  document.getElementById("edit-item-modal-title").innerHTML = '<i class="fas fa-pen"></i> Editar Tarea';
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
    <div class="form-group">
      <label><i class="fas fa-note-sticky" style="color:var(--cyan)"></i> Anotaciones / Observaciones</label>
      <textarea id="ei-notes" class="input" rows="3" placeholder="Escribí notas, detalles, links o apuntes de esta tarea...">${escHtml(item.notes||"")}</textarea>
    </div>
    <div class="form-group">
      <label><i class="fas fa-paperclip" style="color:var(--pink)"></i> Archivos adjuntos</label>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
          <i class="fas fa-upload"></i> Subir archivo desde la PC
          <input type="file" id="ei-file-input" style="display:none" onchange="handleTaskFileUpload(this)">
        </label>
        <span id="ei-file-status" style="font-size:0.75rem;color:var(--text-dim);">PDF, imágenes, hojas de cálculo, etc.</span>
      </div>
      <div id="ei-files-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
    </div>
    <input type="hidden" id="ei-id" value="${item.id}">`;

  renderModalFilesList();
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

function handleTaskFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  // Máximo 10MB por archivo para storage de navegador
  if (file.size > 10 * 1024 * 1024) {
    showToast("El archivo no puede superar los 10 MB", "error");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    tempEditingFiles.push({
      name: file.name,
      size: sizeStr,
      type: file.type,
      data: e.target.result,
    });
    renderModalFilesList();
    showToast(`Archivo "${file.name}" adjuntado ✓`, "info");
    input.value = "";
  };
  reader.onerror = () => {
    showToast("Error al leer el archivo", "error");
    input.value = "";
  };
  reader.readAsDataURL(file);
}

function removeModalFile(index) {
  tempEditingFiles.splice(index, 1);
  renderModalFilesList();
}

function renderModalFilesList() {
  const container = document.getElementById("ei-files-list");
  if (!container) return;

  if (!tempEditingFiles.length) {
    container.innerHTML = '<span style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">Sin archivos adjuntos aún</span>';
    return;
  }

  container.innerHTML = tempEditingFiles.map((f, idx) => `
    <div class="task-file-pill" style="padding-right:4px;">
      <i class="${getFileIconClass(f.name)}"></i>
      <span>${escHtml(truncateFileName(f.name, 22))} (${f.size || ''})</span>
      <button type="button" onclick="removeModalFile(${idx})" style="background:none;border:none;color:var(--red);cursor:pointer;padding:2px 4px;margin-left:4px;" title="Quitar archivo">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join("");
}

async function submitEditItem() {
  const id = parseInt(document.getElementById("ei-id").value);
  const dueVal = document.getElementById("ei-due").value.trim();
  const title = document.getElementById("ei-title").value.trim();

  if (!title) { showToast("El título es obligatorio", "error"); return; }

  const body = {
    title,
    category: document.getElementById("ei-cat").value,
    status:   document.getElementById("ei-status").value,
    priority: document.getElementById("ei-priority").value,
    area:     document.getElementById("ei-area").value || null,
    due_date: dueVal || null,
    notes:    document.getElementById("ei-notes").value.trim() || null,
  };

  try {
    if (id === 0) {
      // Crear nueva tarea directa
      const res = await apiFetch("/dumps/approve", "POST", { items: [body] });
      if (res && res.length) {
        const newItem = res[0];
        state.items.unshift(newItem);
        saveItemFiles(newItem.id, tempEditingFiles);
      }
      showToast("Tarea creada ✓", "success");
    } else {
      // Actualizar tarea existente
      const updated = await apiFetch(`/items/${id}`, "PUT", body);
      const idx = state.items.findIndex(i => i.id === id);
      if (idx !== -1) state.items[idx] = updated;
      saveItemFiles(id, tempEditingFiles);
      showToast("Tarea actualizada ✓", "success");
    }

    closeModal("modal-edit-item");
    renderBoard();
    loadStats();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteItem(id) {
  if (!confirm("¿Eliminar esta tarea?")) return;
  try {
    await apiFetch(`/items/${id}`, "DELETE");
    state.items = state.items.filter(i => i.id !== id);
    try { localStorage.removeItem(`task_files_${id}`); } catch (e) {}
    renderBoard();
    showToast("Tarea eliminada", "success");
    loadStats();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (e) { showToast(e.message, "error"); }
}

