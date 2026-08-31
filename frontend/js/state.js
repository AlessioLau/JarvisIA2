/* state.js — Estado global centralizado de JarvisIA2 */
const state = {
  userId: 1,
  user: null,
  categories: [],
  areas: [],
  rules: [],
  items: [],
  dumps: [],
  facuMaterias: [],
  finanzas: [],
  pedidos: [],
  pendingExtracted: [],  // items de revisión del dump actual
  pendingDumpId: null,
};
