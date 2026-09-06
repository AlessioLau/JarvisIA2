/* auth.js — Gestión de Autenticación, Sesión y Roles para JarvisIA2 */

let currentAuthMode = "login"; // "login" | "register"

function switchAuthTab(mode) {
  currentAuthMode = mode;
  const tabLogin = document.getElementById("auth-tab-login");
  const tabRegister = document.getElementById("auth-tab-register");
  const fieldName = document.getElementById("auth-field-name");
  const submitBtn = document.getElementById("auth-submit-btn");
  const errorMsg = document.getElementById("auth-error-msg");

  if (errorMsg) errorMsg.style.display = "none";

  if (mode === "login") {
    tabLogin.style.background = "var(--primary)";
    tabLogin.style.color = "#fff";
    tabRegister.style.background = "transparent";
    tabRegister.style.color = "var(--text-muted)";
    fieldName.style.display = "none";
    const nameInp = document.getElementById("auth-input-name");
    if (nameInp) nameInp.required = false;
    submitBtn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Iniciar Sesión';
  } else {
    tabRegister.style.background = "var(--primary)";
    tabRegister.style.color = "#fff";
    tabLogin.style.background = "transparent";
    tabLogin.style.color = "var(--text-muted)";
    fieldName.style.display = "block";
    const nameInp = document.getElementById("auth-input-name");
    if (nameInp) nameInp.required = true;
    submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Crear Cuenta';
  }
}

function openAuthModal() {
  const modal = document.getElementById("modal-auth");
  if (modal) {
    modal.style.display = "flex";
    switchAuthTab("login");
    setTimeout(() => {
      document.getElementById("auth-input-username")?.focus();
    }, 100);
  }
}

function closeAuthModal() {
  const modal = document.getElementById("modal-auth");
  if (modal) modal.style.display = "none";
}

async function submitAuth() {
  const username = document.getElementById("auth-input-username").value.trim();
  const password = document.getElementById("auth-input-password").value;
  const name = document.getElementById("auth-input-name")?.value.trim() || "";
  const errorMsg = document.getElementById("auth-error-msg");

  if (errorMsg) errorMsg.style.display = "none";

  if (!username || !password) {
    if (errorMsg) {
      errorMsg.textContent = "Por favor completa todos los campos requeridos.";
      errorMsg.style.display = "block";
    }
    return;
  }

  const endpoint = currentAuthMode === "login" ? "/auth/login" : "/auth/register";
  const payload = currentAuthMode === "login"
    ? { username, password }
    : { username, password, name: name || username };

  try {
    const res = await apiFetch(endpoint, "POST", payload);
    if (!res || !res.token) {
      throw new Error("Respuesta inválida del servidor");
    }

    // Guardar sesión
    state.token = res.token;
    state.user = res.user;
    state.userId = res.user.id;
    state.filterUserId = null;

    localStorage.setItem("jarvis_token", res.token);
    localStorage.setItem("jarvis_user", JSON.stringify(res.user));
    localStorage.setItem("jarvis_user_id", String(res.user.id));

    closeAuthModal();
    updateUserBar();
    showToast(`¡Bienvenido, ${res.user.name || res.user.username}!`, "success");

    // Recargar datos para el usuario logueado
    if (typeof reloadAllData === "function") {
      await reloadAllData();
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = err.message || "Error al autenticar. Verificá tus credenciales.";
      errorMsg.style.display = "block";
    }
  }
}

function updateUserBar() {
  const nameEl = document.getElementById("sidebar-user-name");
  const roleEl = document.getElementById("sidebar-user-role");
  const dashGreeting = document.getElementById("dash-greeting");

  if (state.user) {
    const displayName = state.user.name || state.user.username;
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) {
      const isAdm = state.user.role === "admin";
      roleEl.innerHTML = isAdm
        ? '<span style="color:var(--amber);font-weight:600;"><i class="fas fa-crown"></i> Admin</span>'
        : '<span style="color:var(--cyan);"><i class="fas fa-user"></i> Usuario</span>';
    }
    if (dashGreeting) {
      const hour = new Date().getHours();
      let timeGreeting = "¡Buenas noches";
      if (hour >= 6 && hour < 12) timeGreeting = "¡Buenos días";
      else if (hour >= 12 && hour < 20) timeGreeting = "¡Buenas tardes";
      dashGreeting.textContent = `${timeGreeting}, ${displayName}! 👋`;
      dashGreeting.style.display = "block";
    }

    // Si es admin, cargar selector de usuarios en el tablero kanban
    if (state.user.role === "admin") {
      setupAdminUserFilter();
    } else {
      const userSelect = document.getElementById("filter-board-user");
      if (userSelect) userSelect.style.display = "none";
    }
  } else {
    if (nameEl) nameEl.textContent = "Sin sesión";
    if (roleEl) roleEl.textContent = "Invitado";
    if (dashGreeting) {
      dashGreeting.textContent = "";
      dashGreeting.style.display = "none";
    }
  }
}

async function setupAdminUserFilter() {
  const userSelect = document.getElementById("filter-board-user");
  if (!userSelect) return;
  try {
    const users = await apiFetch("/auth/users");
    state.allUsers = users || [];
    userSelect.innerHTML = '<option value="">Todos los usuarios (Admin)</option>';
    state.allUsers.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = `${u.name || u.username} (@${u.username}) [${u.role}]`;
      if (state.filterUserId == u.id) opt.selected = true;
      userSelect.appendChild(opt);
    });
    userSelect.style.display = "inline-block";
    userSelect.onchange = async () => {
      state.filterUserId = userSelect.value ? parseInt(userSelect.value) : null;
      if (typeof loadItems === "function") await loadItems();
    };
  } catch (err) {
    console.error("Error al cargar lista de usuarios para admin:", err);
  }
}

// ══════════════════════════════════════════════════════════
// GOOGLE / SUPABASE OAUTH
// ══════════════════════════════════════════════════════════
let _supabaseClient = null;

async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (!window.supabase || !window.supabase.createClient) {
    console.warn("Supabase JS SDK no cargado");
    return null;
  }
  try {
    const config = await apiFetch("/auth/config");
    if (config && config.supabaseUrl && config.supabaseAnonKey) {
      _supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      return _supabaseClient;
    }
  } catch (err) {
    console.error("Error al obtener config de Supabase Auth:", err);
  }
  return null;
}

async function loginWithGoogle() {
  const errorMsg = document.getElementById("auth-error-msg");
  if (errorMsg) errorMsg.style.display = "none";

  const btn = document.getElementById("btn-google-login");
  const origText = btn ? btn.innerHTML : "";
  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirigiendo a Google...';

  try {
    const sb = await getSupabaseClient();
    if (!sb) {
      throw new Error("Autenticación con Google no disponible. Verificá las variables de Supabase.");
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) throw error;
  } catch (err) {
    if (btn) btn.innerHTML = origText;
    if (errorMsg) {
      errorMsg.textContent = err.message || "Error al conectar con Google.";
      errorMsg.style.display = "block";
    }
  }
}

async function handleOAuthCallback() {
  // Cuando Supabase redirige con #access_token=...
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) return false;

  try {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    if (!accessToken) return false;

    // Limpiar hash de la barra de direcciones
    window.history.replaceState(null, null, window.location.pathname + window.location.search);

    // Sincronizar usuario en el backend
    const res = await apiFetch("/auth/oauth-sync", "POST", { access_token: accessToken });
    if (res && res.token) {
      state.token = res.token;
      state.user = res.user;
      state.userId = res.user.id;
      state.filterUserId = null;

      localStorage.setItem("jarvis_token", res.token);
      localStorage.setItem("jarvis_user", JSON.stringify(res.user));
      localStorage.setItem("jarvis_user_id", String(res.user.id));

      closeAuthModal();
      updateUserBar();
      showToast(`¡Hola, ${res.user.name || res.user.username}! Has ingresado con Google ✓`, "success");
      return true;
    }
  } catch (err) {
    console.error("Error al procesar callback OAuth de Google:", err);
    showToast("Error al autenticar con Google. Probá nuevamente.", "error");
  }
  return false;
}

function logout() {
  state.token = null;
  state.user = null;
  state.userId = 1;
  state.filterUserId = null;
  localStorage.removeItem("jarvis_token");
  localStorage.removeItem("jarvis_user");
  localStorage.removeItem("jarvis_user_id");

  // Si había sesión en Supabase Client, cerrarla
  if (_supabaseClient) {
    _supabaseClient.auth.signOut().catch(() => {});
  }

  updateUserBar();
  showToast("Sesión cerrada.", "info");
  openAuthModal();
}

async function checkAuthSession() {
  // 1. Revisar si venimos de un redirect de Google
  const oauthHandled = await handleOAuthCallback();
  if (oauthHandled) {
    return true;
  }

  // 2. Revisar token almacenado en localStorage
  if (!state.token) {
    openAuthModal();
    return false;
  }
  try {
    const me = await apiFetch("/auth/me");
    state.user = me;
    state.userId = me.id;
    localStorage.setItem("jarvis_user", JSON.stringify(me));
    localStorage.setItem("jarvis_user_id", String(me.id));
    updateUserBar();
    return true;
  } catch (err) {
    console.warn("Token inválido o expirado:", err);
    logout();
    return false;
  }
}


