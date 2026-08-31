/* modules/config.js — Áreas, Categorías y Reglas */

// ══════════════════════════════════════════════════════════
// CATEGORÍAS
// ══════════════════════════════════════════════════════════
async function loadCategories() {
  try {
    state.categories = await apiFetch("/categories");
    renderCategories();
    populateBoardFilters();
  } catch (e) { console.error(e); }
}

function renderCategories() {
  const list = document.getElementById("cat-chips");
  if (!list) return;
  if (!state.categories.length) {
    list.innerHTML = '<span class="empty">Sin categorías</span>'; return;
  }
  list.innerHTML = state.categories.map(c => `
    <div class="chip">
      <span class="dot" style="background:${escHtml(c.color)}"></span>
      ${escHtml(c.name)}
      <button class="icon-btn delete" style="padding:2px 4px;font-size:.72rem;" onclick="deleteCategory(${c.id})" title="Eliminar"><i class="fas fa-times"></i></button>
    </div>`).join("");
}

async function submitNewCategory() {
  const name  = document.getElementById("new-cat-name").value.trim();
  const color = document.getElementById("new-cat-color").value;
  const desc  = document.getElementById("new-cat-desc").value.trim();
  if (!name) { showToast("El nombre es obligatorio", "error"); return; }
  try {
    const created = await apiFetch("/categories", "POST", { name, color, description: desc });
    state.categories.push(created);
    renderCategories(); populateBoardFilters();
    document.getElementById("new-cat-name").value = "";
    document.getElementById("new-cat-desc").value = "";
    showToast(`Categoría "${created.name}" creada ✓`, "success");
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteCategory(id) {
  if (!confirm("¿Eliminar esta categoría?")) return;
  try {
    await apiFetch(`/categories/${id}`, "DELETE");
    state.categories = state.categories.filter(c => c.id !== id);
    renderCategories(); populateBoardFilters();
    showToast("Categoría eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}


// ══════════════════════════════════════════════════════════
// ÁREAS
// ══════════════════════════════════════════════════════════
async function loadAreas() {
  try {
    state.areas = await apiFetch("/areas");
    renderAreas();
    populateBoardFilters();
  } catch (e) { console.error(e); }
}

function renderAreas() {
  const list = document.getElementById("area-chips");
  if (!list) return;
  if (!state.areas.length) { list.innerHTML = '<span class="empty">Sin áreas</span>'; return; }
  list.innerHTML = state.areas.map(a => `
    <div class="chip">
      <i class="fas ${escHtml(a.icon)}" style="color:${escHtml(a.color)}"></i>
      ${escHtml(a.name)}
      <button class="icon-btn delete" style="padding:2px 4px;font-size:.72rem;" onclick="deleteArea(${a.id})" title="Eliminar"><i class="fas fa-times"></i></button>
    </div>`).join("");
}

async function submitNewArea() {
  const name  = document.getElementById("new-area-name").value.trim();
  const color = document.getElementById("new-area-color").value;
  const icon  = document.getElementById("new-area-icon").value.trim() || "fa-layer-group";
  const desc  = document.getElementById("new-area-desc").value.trim();
  if (!name) { showToast("El nombre es obligatorio", "error"); return; }
  try {
    const created = await apiFetch("/areas", "POST", { name, color, icon, description: desc });
    state.areas.push(created);
    renderAreas(); populateBoardFilters();
    document.getElementById("new-area-name").value  = "";
    document.getElementById("new-area-icon").value  = "";
    document.getElementById("new-area-desc").value  = "";
    showToast(`Área "${created.name}" creada ✓`, "success");
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteArea(id) {
  if (!confirm("¿Eliminar esta área?")) return;
  try {
    await apiFetch(`/areas/${id}`, "DELETE");
    state.areas = state.areas.filter(a => a.id !== id);
    renderAreas(); populateBoardFilters();
    showToast("Área eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}


// ══════════════════════════════════════════════════════════
// REGLAS
// ══════════════════════════════════════════════════════════
async function loadRules() {
  try {
    state.rules = await apiFetch("/rules");
    renderRules();
  } catch (e) { console.error(e); }
}

function renderRules() {
  const filterType = document.getElementById("filter-rule-type")?.value || "";
  const search     = (document.getElementById("rule-search")?.value || "").toLowerCase();
  let rules = state.rules;
  if (filterType) rules = rules.filter(r => r.target_type === filterType);
  if (search)     rules = rules.filter(r => r.keyword.toLowerCase().includes(search) || r.target_value.toLowerCase().includes(search));

  const container = document.getElementById("rules-grid");
  if (!container) return;
  if (!rules.length) {
    container.innerHTML = '<div class="empty" style="grid-column:1/-1"><i class="fas fa-filter-circle-xmark"></i>Sin reglas</div>';
    return;
  }

  const typeColor = { area:"var(--purple)", category:"var(--cyan)", priority:"var(--red)", context:"var(--amber)" };
  container.innerHTML = rules.map(r => `
    <div class="rule-card">
      <div>
        <div class="rule-kw">"${escHtml(r.keyword)}"</div>
        <div style="font-size:.78rem;color:var(--text-muted)">
          <span style="color:${typeColor[r.target_type]||"var(--text)"}">${escHtml(r.target_type)}</span>
          → <strong style="color:var(--text)">${escHtml(r.target_value)}</strong>
        </div>
      </div>
      <button class="icon-btn delete" onclick="deleteRule(${r.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
    </div>`).join("");
}

async function submitNewRule() {
  const keyword      = document.getElementById("new-rule-kw").value.trim();
  const target_type  = document.getElementById("new-rule-type").value;
  const target_value = document.getElementById("new-rule-val").value.trim();
  if (!keyword || !target_value) { showToast("Rellena keyword y valor", "error"); return; }
  try {
    const created = await apiFetch("/rules", "POST", { keyword, target_type, target_value });
    state.rules.push(created);
    renderRules();
    document.getElementById("new-rule-kw").value  = "";
    document.getElementById("new-rule-val").value = "";
    showToast("Regla creada ✓", "success");
  } catch (e) { showToast(e.message, "error"); }
}

async function deleteRule(id) {
  if (!confirm("¿Eliminar esta regla?")) return;
  try {
    await apiFetch(`/rules/${id}`, "DELETE");
    state.rules = state.rules.filter(r => r.id !== id);
    renderRules();
    showToast("Regla eliminada", "success");
  } catch (e) { showToast(e.message, "error"); }
}
