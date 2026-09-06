/* state.js — Estado global centralizado de JarvisIA2 */
const state = {
  token: localStorage.getItem("jarvis_token") || null,
  userId: parseInt(localStorage.getItem("jarvis_user_id")) || 1,
  user: JSON.parse(localStorage.getItem("jarvis_user") || "null"),
  allUsers: [],          // Lista de usuarios si es admin
  filterUserId: null,    // Filtro activo si es admin
  categories: [],
  areas: [],
  rules: [],
  items: [],
  dumps: [],
  facuMaterias: [],
  finanzas: [],
  inversiones: [],
  pedidos: [],
  pendingExtracted: [],  // items de revisión del dump actual
  pendingDumpId: null,
};

