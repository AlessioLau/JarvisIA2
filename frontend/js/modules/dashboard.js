/* dashboard.js — Módulo Dashboard / Vista Inicio de JarvisIA2 */

async function renderDashboard() {
  const greetingEl = document.getElementById("dash-greeting");
  const dateEl = document.getElementById("dash-date");

  if (greetingEl) {
    if (state.user) {
      const hour = new Date().getHours();
      let timeGreeting = "¡Buenas noches";
      if (hour >= 6 && hour < 12) timeGreeting = "¡Buenos días";
      else if (hour >= 12 && hour < 20) timeGreeting = "¡Buenas tardes";
      const displayName = state.user.name || state.user.username || "";
      greetingEl.textContent = `${timeGreeting}, ${displayName}! 👋`;
      greetingEl.style.display = "block";
    } else {
      greetingEl.textContent = "";
      greetingEl.style.display = "none";
    }
  }

  if (dateEl) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString('es-AR', options);
    dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  }

  // Métricas rápidas
  const totalTasks = state.items.length;
  const pendingTasks = state.items.filter(i => i.status === "pendiente").length;
  const inProgressTasks = state.items.filter(i => i.status === "en_progreso").length;
  const completedTasks = state.items.filter(i => i.status === "completado").length;

  const activePedidos = state.pedidos.filter(p => !["Entregado", "Cancelado"].includes(p.status)).length;
  const totalMaterias = state.facuMaterias.length;
  const cursandoMaterias = state.facuMaterias.filter(m => m.status === "Cursando").length;

  const ingresos = state.finanzas.filter(t => t.type === "ingreso").reduce((s, t) => s + Number(t.amount || 0), 0);
  const gastos = state.finanzas.filter(t => t.type === "gasto").reduce((s, t) => s + Number(t.amount || 0), 0);
  const balance = ingresos - gastos;

  // Actualizar DOM de métricas
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl("dash-stat-pending", pendingTasks);
  setEl("dash-stat-progress", inProgressTasks);
  setEl("dash-stat-pedidos", activePedidos);
  setEl("dash-stat-facu", cursandoMaterias);

  const balEl = document.getElementById("dash-stat-balance");
  if (balEl) {
    balEl.textContent = `$${balance.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
    balEl.style.color = balance >= 0 ? "var(--emerald)" : "var(--red)";
  }

  // Tareas Próximas o Vencidas
  renderDashboardUpcoming();

  // Pedidos 3D activos
  renderDashboardPedidos();

  // Progreso Kanban / Tareas
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const progressText = document.getElementById("dash-kanban-pct");
  if (progressText) progressText.textContent = `${pct}%`;
  const progressBar = document.getElementById("dash-kanban-bar");
  if (progressBar) progressBar.style.width = `${pct}%`;
}

function renderDashboardUpcoming() {
  const container = document.getElementById("dash-upcoming-list");
  if (!container) return;

  const todayStr = getTodayDDMMYYYY();
  const upcomingItems = state.items.filter(item => item.status !== "completado" && item.due_date);

  // Ordenar por fecha
  upcomingItems.sort((a, b) => {
    const parseDate = (d) => {
      if (!d) return 99999999;
      const parts = d.split("/");
      if (parts.length === 3) return parseInt(parts[2] + parts[1].padStart(2, "0") + parts[0].padStart(2, "0"));
      return 99999999;
    };
    return parseDate(a.due_date) - parseDate(b.due_date);
  });

  if (!upcomingItems.length) {
    container.innerHTML = `
      <div class="dash-empty-state">
        <i class="fas fa-calendar-check" style="font-size:1.8rem;color:var(--emerald);margin-bottom:8px;"></i>
        <p>No tienes tareas pendientes con fecha límite asignada.</p>
      </div>`;
    return;
  }

  container.innerHTML = upcomingItems.slice(0, 5).map(item => {
    const statusObj = getDateStatus(item.due_date);
    return `
      <div class="dash-item-row" onclick="navigate('board')">
        <div class="dash-item-info">
          <div class="dash-item-title">${escHtml(item.title)}</div>
          <div class="dash-item-meta">
            ${catBadge(item.category)}
            ${item.area ? `<span class="badge" style="background:rgba(139,92,246,.2);color:#a78bfa">${escHtml(item.area)}</span>` : ""}
          </div>
        </div>
        <div class="dash-item-date">
          ${statusObj.badge}
        </div>
      </div>
    `;
  }).join("");
}

function renderDashboardPedidos() {
  const container = document.getElementById("dash-pedidos-list");
  if (!container) return;

  const active = state.pedidos.filter(p => !["Entregado", "Cancelado"].includes(p.status));

  if (!active.length) {
    container.innerHTML = `
      <div class="dash-empty-state">
        <i class="fas fa-box-open" style="font-size:1.8rem;color:var(--purple);margin-bottom:8px;"></i>
        <p>No hay pedidos 3D en curso actualmente.</p>
      </div>`;
    return;
  }

  container.innerHTML = active.slice(0, 4).map(p => `
    <div class="dash-item-row" onclick="navigate('pedidos')">
      <div class="dash-item-info">
        <div class="dash-item-title"><strong>${escHtml(p.client)}</strong> — ${escHtml(p.product)}</div>
        <div class="dash-item-meta">
          <span class="badge badge-media">${escHtml(p.priority || "media")}</span>
          ${p.price ? `<span style="color:var(--emerald);font-weight:600;font-size:.8rem;">$${Number(p.price).toLocaleString("es-AR")}</span>` : ""}
        </div>
      </div>
      <div>
        <span class="badge" style="background:rgba(6,182,212,.2);color:var(--cyan);font-weight:600">${escHtml(p.status)}</span>
      </div>
    </div>
  `).join("");
}

async function quickDumpDashboard() {
  const input = document.getElementById("dash-quick-dump");
  if (!input) return;
  const text = input.value.trim();
  if (!text) {
    showToast("Escribe algo para capturar", "info");
    return;
  }

  try {
    const dump = await apiFetch("/dumps", "POST", { text });
    input.value = "";
    showToast("Idea capturada ✓ Procesando...", "success");
    
    // Cambiar a la pestaña dump y procesar
    document.getElementById("dump-text").value = text;
    navigate("dump");
    processDump();
  } catch (e) {
    showToast(e.message, "error");
  }
}
