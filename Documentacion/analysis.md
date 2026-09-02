# Análisis JarvisIA2 — ¿Qué le falta?

## Lo que YA funciona bien ✅

| Módulo | Estado |
|---|---|
| Captura de Ideas (Dump) con motor determinista | ✅ Funcional |
| Tablero Kanban (3 columnas) | ✅ Funcional |
| Historial de Dumps | ✅ Funcional |
| Facultad (materias CRUD + import/export Excel) | ✅ Funcional |
| Finanzas (gastos/ingresos/inversiones + Excel) | ✅ Funcional |
| Pedidos 3D (CRUD + calculadora + Excel) | ✅ Funcional |
| Configuración (categorías, áreas, reglas) | ✅ Funcional |
| Backend FastAPI + Supabase REST | ✅ Recién migrado |
| UI Glassmorphism dark premium | ✅ Buen diseño |

---

## 🔴 Bugs / Problemas Activos

### 1. `ai_service.py` sigue usando SQLite
El motor determinista ([ai_service.py](file:///c:/Lua/Programacion/JarvisIA2/backend/services/ai_service.py#L60-L64)) todavía usa `get_db()` (SQLite) en `_load_rules()` en lugar de supabase:
```python
def _load_rules(user_id):
    with get_db() as conn:  # ← debería usar sb_select si Supabase está activo
```

### 2. Vercel deployment roto
[vercel.json](file:///c:/Lua/Programacion/JarvisIA2/vercel.json) y [api/index.py](file:///c:/Lua/Programacion/JarvisIA2/api/index.py) siguen apuntando a la estructura vieja. Con la migración a Supabase, esto probablemente no funcione en Vercel sin actualizar dependencias y env vars.

### 3. No hay autenticación real
La app tiene login/register en el backend pero la UI **nunca lo usa** — el user_id está hardcodeado en `1` en [state.js](file:///c:/Lua/Programacion/JarvisIA2/frontend/js/state.js#L3). Cualquiera puede ver y modificar los datos.

---

## 🟡 Features Faltantes (Impacto Alto)

### 4. Sin Dashboard / Home
No hay una vista de inicio con métricas. El sidebar muestra 3 stats (pendientes, pedidos, balance) pero no hay una pantalla principal con gráficos, resumen del día, o vista rápida.

### 5. Sin notificaciones/recordatorios
Las tareas tienen `due_date` pero no hay:
- Indicador visual de tareas vencidas o próximas
- No hay notificaciones push, ni email, ni alertas en la UI
- No hay vista de "vence hoy" / "vence esta semana"

### 6. Sin búsqueda global
No hay forma de buscar texto libre en items, dumps, pedidos o finanzas desde un solo lugar.

### 7. Sin Drag & Drop en Kanban
El tablero Kanban tiene 3 columnas pero los items se cambian de estado solo por edición manual (abrir modal → cambiar select). No hay drag & drop.

### 8. Sin responsive / móvil
El sidebar es fijo de 268px. No hay hamburger menu ni breakpoints responsive. **La app es inutilizable en celular.**

---

## 🟢 Mejoras (Impacto Medio)

### 9. Sin gráficos en Finanzas
Los resúmenes son solo números ($ingresos, $gastos, $balance). Faltaría:
- Gráfico de barras o líneas de gastos por mes
- Torta/donut de gastos por categoría
- Evolución temporal del balance

### 10. Sin inversiones en la UI
La tabla `inversiones` tiene endpoints backend completos (`GET/POST/DELETE /api/inversiones`) pero **no hay ninguna pestaña ni tabla en el frontend** para gestionarlas. Solo se importan/exportan via Excel.

### 11. Sin paginación
Todas las tablas cargan TODO de golpe. Con muchos datos (cientos de finanzas, pedidos), la performance se degrada.

### 12. Sin confirmación en DELETE
Los botones de borrar ejecutan inmediatamente sin diálogo de confirmación "¿Estás seguro?".

### 13. Sin modo offline / PWA
No hay Service Worker, manifest.json ni caché. Si se pierde conexión a Supabase, la app no funciona.

### 14. Sin dark/light toggle
Solo hay modo dark. Algunos usuarios prefieren modo claro. Es un nice-to-have.

### 15. Sin subtareas
Los items son planos. No hay subtareas, checklists, ni progreso parcial.

### 16. Sin edición de finanzas desde la tabla
La tabla de finanzas no tiene botón de editar inline (el modal existe pero no se usa para edición).

---

## 📋 Resumen priorizado

| Prioridad | Qué | Por qué |
|---|---|---|
| 🔴 **Crítico** | Fix ai_service.py → Supabase | Si no, el motor de dumps no detecta las reglas correctas |
| 🔴 **Crítico** | Responsive / móvil | Inutilizable sin esto |
| 🟡 **Alto** | Dashboard con métricas | Primera impresión al abrir la app |
| 🟡 **Alto** | Autenticación real (login screen) | Seguridad básica |
| 🟡 **Alto** | Vista "Vence hoy / esta semana" | Funcionalidad core de productividad |
| 🟡 **Alto** | Drag & Drop en Kanban | UX esperada de un board |
| 🟡 **Alto** | Pestaña de Inversiones | Feature backend sin frontend |
| 🟢 **Medio** | Gráficos en Finanzas | Visualización útil |
| 🟢 **Medio** | Búsqueda global | Productividad |
| 🟢 **Medio** | Confirmación de DELETE | Prevenir errores |
| 🟢 **Medio** | Paginación | Performance con muchos datos |
| 🔵 **Bajo** | PWA / offline | Nice-to-have |
| 🔵 **Bajo** | Dark/light toggle | Cosmético |
| 🔵 **Bajo** | Subtareas | Feature avanzada |
