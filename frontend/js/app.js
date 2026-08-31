/* app.js — Init y navegación principal de JarvisIA2 */

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
async function init() {
  // Nav links
  document.querySelectorAll(".nav-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.tab));
  });

  // Cargar datos base
  await Promise.all([
    loadCategories(),
    loadAreas(),
    loadRules(),
    loadItems(),
    loadFacu(),
    loadFinanzas(),
    loadPedidos(),
  ]);
  await loadStats();
  await loadDumps();

  // Dump textarea — live preview
  const ta = document.getElementById("dump-text");
  if (ta) ta.addEventListener("input", updateLivePreview);

  // Board filters
  document.getElementById("filter-board-cat")?.addEventListener("change", renderBoard);
  document.getElementById("filter-board-area")?.addEventListener("change", renderBoard);

  // Facu filters
  document.getElementById("filter-facu-status")?.addEventListener("change", renderFacu);

  // Finanzas filters
  document.getElementById("filter-fin-type")?.addEventListener("change", renderFinanzas);

  // Pedidos filters
  document.getElementById("filter-pedido-status")?.addEventListener("change", renderPedidos);

  // Rules filters
  document.getElementById("filter-rule-type")?.addEventListener("change", renderRules);
  document.getElementById("rule-search")?.addEventListener("input", renderRules);

  // Calculadora auto-calc
  ["calc-grams","calc-hours","calc-pgram","calc-phour","calc-margin"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcularCosto);
  });

  navigate("dump");
}

// ══════════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════════
async function loadStats() {
  try {
    const stats = await apiFetch("/stats");
    const el = id => document.getElementById(id);
    if (el("stat-pending"))  el("stat-pending").textContent  = stats.pending;
    if (el("stat-pedidos"))  el("stat-pedidos").textContent  = stats.active_pedidos;
    if (el("stat-balance"))  el("stat-balance").textContent  = `$${Number(stats.balance).toLocaleString("es-AR",{minimumFractionDigits:0})}`;
  } catch (e) { console.error(e); }
}

document.addEventListener("DOMContentLoaded", init);
