"""main.py — Servidor FastAPI para JarvisIA2 (v2 — formatos reales de Excel)"""
from __future__ import annotations

import io, sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from database import (
    get_db, init_db, use_supabase, get_sb,
    sb_select, sb_select_multi_filter, sb_get_one,
    sb_insert, sb_insert_many, sb_update, sb_delete,
    sb_count, sb_sum, now_iso,
    SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
)
try:
    from database import sb_delete_in
except ImportError:
    def sb_delete_in(table: str, column: str, values: list, filters: dict = None) -> None:
        if not values:
            return
        q = get_sb().table(table).delete()
        for k, v in (filters or {}).items():
            q = q.eq(k, v)
        q.in_(column, values).execute()

from schemas import (
    ApproveRequest, AreaCreate, AreaOut,
    BatchDeleteRequest,
    CategoryCreate, CategoryOut,
    DumpCreate, DumpOut, ExtractedItem,
    FacuCreate, FacuOut,
    FinanzaCreate, FinanzaOut,
    InversionCreate, InversionOut,
    ItemOut, ItemUpdate,
    PedidoCreate, PedidoOut,
    ProcessRequest, ProcessResponse,
    RuleCreate, RuleOut,
    UserLogin, UserRegister,
    OAuthSyncRequest,
)
from services import auth_service
from services import ai_service

init_db()

app = FastAPI(title="JarvisIA2 API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Auth Dependency ────────────────────────────────────────────────────────
def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Obtiene el usuario autenticado a partir del header Authorization: Bearer <token>."""
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    payload = auth_service.verify_token(token)
    if not payload:
        return None
    return {
        "id": payload["sub"],
        "username": payload["username"],
        "name": payload.get("name", ""),
        "role": payload.get("role", "user"),
    }

def resolve_effective_user_id(
    requested_user_id: Optional[int] = None,
    current_user: Optional[dict] = None
) -> int:
    """
    Determina el user_id efectivo a consultar:
    - Si el usuario es admin: puede consultar requested_user_id si se pasa, de lo contrario su propio id.
    - Si es user normal: SIEMPRE su propio id (no puede ver registros de otros).
    - Si no está autenticado (fallback retrocompatible): usa requested_user_id o 1.
    """
    if current_user:
        if current_user.get("role") == "admin":
            return requested_user_id if requested_user_id is not None else current_user["id"]
        # Usuario normal: restringido a sus propios datos
        return current_user["id"]
    return requested_user_id if requested_user_id is not None else 1


# ── helpers ────────────────────────────────────────────────────────────────
def row_or_404(row, msg="Not found"):
    if row is None:
        raise HTTPException(status_code=404, detail=msg)
    return dict(row)

def today_str() -> str:
    return datetime.now().strftime("%d/%m/%Y")

def fmt_date(val) -> str:
    """Convierte datetime de openpyxl o string a dd/mm/aaaa."""
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.strftime("%d/%m/%Y")
    s = str(val).strip()
    # Si es timestamp ISO
    if "T" in s:
        try:
            return datetime.fromisoformat(s.split("T")[0]).strftime("%d/%m/%Y")
        except Exception:
            pass
    # Si ya es dd/mm/aaaa
    if len(s) >= 8 and "/" in s:
        return s.split(" ")[0]
    return s

def _hdr_style(ws, row: int, fill_color: str = "1e293b"):
    """Aplica estilo de cabecera a una fila entera."""
    fill = PatternFill("solid", fgColor=fill_color)
    font = Font(bold=True, color="FFFFFF")
    for cell in ws[row]:
        if cell.value is not None:
            cell.fill  = fill
            cell.font  = font
            cell.alignment = Alignment(horizontal="center")


# ══════════════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/api/auth/register", status_code=201)
def api_register(body: UserRegister):
    res = auth_service.register(body.username, body.password, body.name, body.role)
    if not res:
        raise HTTPException(400, "El usuario ya existe")
    return res

@app.post("/api/auth/login")
def api_login(body: UserLogin):
    res = auth_service.login(body.username, body.password)
    if not res:
        raise HTTPException(401, "Credenciales incorrectas")
    return res

@app.get("/api/auth/config")
def api_auth_config():
    """Retorna las claves públicas necesarias para que el cliente frontend inicialice Supabase Auth."""
    return {
        "supabaseUrl": SUPABASE_URL if use_supabase() else "",
        "supabaseAnonKey": SUPABASE_PUBLISHABLE_KEY if use_supabase() else "",
        "oauthEnabled": bool(use_supabase() and SUPABASE_PUBLISHABLE_KEY),
    }

@app.post("/api/auth/oauth-sync")
def api_oauth_sync(body: OAuthSyncRequest):
    """Sincroniza el usuario autenticado con Google/OAuth en Supabase hacia la tabla users y emite token."""
    res = auth_service.sync_oauth_user(body.access_token)
    if not res:
        raise HTTPException(400, "No se pudo sincronizar la sesión con Google")
    return res


@app.get("/api/auth/me")
def api_me(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(401, "No autenticado")
    return current_user

@app.get("/api/auth/users")
def get_all_users(current_user: Optional[dict] = Depends(get_current_user)):
    """Solo admins pueden ver la lista de usuarios para cambiar de vista o asignar."""
    if not current_user or current_user.get("role") != "admin":
        raise HTTPException(403, "Acceso denegado: solo administradores")
    if use_supabase():
        try:
            users = get_sb().table("users").select("id, username, name, role").execute().data or []
        except Exception:
            users = get_sb().table("users").select("id, username, name").execute().data or []
        for u in users:
            if not u.get("role"):
                u["role"] = "admin" if u.get("username") == "admin" else "user"
        return users
    with get_db() as conn:
        rows = conn.execute("SELECT id, username, name, role FROM users ORDER BY id ASC").fetchall()
        return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════════════════════
# CATEGORÍAS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/categories", response_model=List[CategoryOut])
def get_categories(user_id: int = 1):
    if use_supabase():
        return sb_select("categories", {"user_id": user_id}, order="name")
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM categories WHERE user_id=? ORDER BY name", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryCreate, user_id: int = 1):
    if use_supabase():
        try:
            return sb_insert("categories", {
                "user_id": user_id,
                "name": body.name.lower().strip(),
                "color": body.color,
                "description": body.description,
            })
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower() or "23505" in str(e):
                raise HTTPException(400, "La categoría ya existe")
            raise
    with get_db() as conn:
        try:
            conn.execute("INSERT INTO categories (user_id,name,color,description) VALUES (?,?,?,?)",
                         (user_id, body.name.lower().strip(), body.color, body.description))
            conn.commit()
            row = conn.execute("SELECT * FROM categories WHERE user_id=? AND name=?",
                               (user_id, body.name.lower().strip())).fetchone()
            return dict(row)
        except Exception as e:
            if "IntegrityError" in type(e).__name__ or "unique" in str(e).lower():
                raise HTTPException(400, "La categoría ya existe")
            raise


@app.delete("/api/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int):
    if use_supabase():
        sb_delete("categories", {"id": cat_id})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM categories WHERE id=?", (cat_id,))
        conn.commit()


# ══════════════════════════════════════════════════════════════════════════════
# ÁREAS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/areas", response_model=List[AreaOut])
def get_areas(user_id: int = 1):
    if use_supabase():
        return sb_select("areas", {"user_id": user_id}, order="name")
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM areas WHERE user_id=? ORDER BY name", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/areas", response_model=AreaOut, status_code=201)
def create_area(body: AreaCreate, user_id: int = 1):
    if use_supabase():
        try:
            return sb_insert("areas", {
                "user_id": user_id,
                "name": body.name.strip(),
                "color": body.color,
                "icon": body.icon,
                "description": body.description,
            })
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower() or "23505" in str(e):
                raise HTTPException(400, "El área ya existe")
            raise
    with get_db() as conn:
        try:
            conn.execute("INSERT INTO areas (user_id,name,color,icon,description) VALUES (?,?,?,?,?)",
                         (user_id, body.name.strip(), body.color, body.icon, body.description))
            conn.commit()
            row = conn.execute("SELECT * FROM areas WHERE user_id=? AND name=?",
                               (user_id, body.name.strip())).fetchone()
            return dict(row)
        except Exception as e:
            if "IntegrityError" in type(e).__name__ or "unique" in str(e).lower():
                raise HTTPException(400, "El área ya existe")
            raise


@app.delete("/api/areas/{area_id}", status_code=204)
def delete_area(area_id: int):
    if use_supabase():
        sb_delete("areas", {"id": area_id})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM areas WHERE id=?", (area_id,))
        conn.commit()


# ══════════════════════════════════════════════════════════════════════════════
# REGLAS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/rules", response_model=List[RuleOut])
def get_rules(user_id: int = 1):
    if use_supabase():
        return sb_select("rules", {"user_id": user_id}, order="target_type")
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM rules WHERE user_id=? ORDER BY target_type, keyword", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/rules", response_model=RuleOut, status_code=201)
def create_rule(body: RuleCreate, user_id: int = 1):
    if use_supabase():
        return sb_insert("rules", {
            "user_id": user_id,
            "keyword": body.keyword.lower().strip(),
            "target_type": body.target_type,
            "target_value": body.target_value,
        })
    with get_db() as conn:
        conn.execute("INSERT INTO rules (user_id,keyword,target_type,target_value) VALUES (?,?,?,?)",
                     (user_id, body.keyword.lower().strip(), body.target_type, body.target_value))
        conn.commit()
        row = conn.execute("SELECT * FROM rules WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
        return dict(row)

@app.delete("/api/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int):
    if use_supabase():
        sb_delete("rules", {"id": rule_id})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM rules WHERE id=?", (rule_id,))
        conn.commit()


# ══════════════════════════════════════════════════════════════════════════════
# DUMPS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/dumps", response_model=List[DumpOut])
def get_dumps(user_id: int = 1):
    if use_supabase():
        return sb_select("dumps", {"user_id": user_id}, order="id", desc=True)
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM dumps WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/dumps", response_model=DumpOut, status_code=201)
def create_dump(body: DumpCreate, user_id: int = 1):
    if use_supabase():
        return sb_insert("dumps", {"user_id": user_id, "original_text": body.text, "status": "pending"})
    with get_db() as conn:
        conn.execute("INSERT INTO dumps (user_id,original_text,status) VALUES (?,?,?)",
                     (user_id, body.text, "pending"))
        conn.commit()
        row = conn.execute("SELECT * FROM dumps WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
        return dict(row)

@app.post("/api/dumps/process", response_model=ProcessResponse)
def process_dump(body: ProcessRequest, user_id: int = 1):
    text = body.text
    if body.dump_id and not text:
        if use_supabase():
            row = sb_get_one("dumps", {"id": body.dump_id})
        else:
            with get_db() as conn:
                row = conn.execute("SELECT original_text FROM dumps WHERE id=?", (body.dump_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Dump no encontrado")
        text = row["original_text"]
    if not text:
        raise HTTPException(400, "Texto requerido")
    items = ai_service.process(text, user_id)
    return ProcessResponse(dump_id=body.dump_id, original_text=text, extracted_items=items)

@app.post("/api/dumps/approve", response_model=List[ItemOut], status_code=201)
def approve_items(body: ApproveRequest, user_id: int = 1):
    if use_supabase():
        inserted = []
        for item in body.items:
            row = sb_insert("items", {
                "user_id": user_id,
                "dump_id": body.dump_id,
                "title": item.title,
                "category": item.category,
                "status": "pendiente",
                "priority": item.priority or "media",
                "area": item.area,
                "due_date": item.due_date,
                "notes": item.notes,
            })
            inserted.append(row)
        if body.dump_id:
            sb_update("dumps", body.dump_id, {"status": "processed"})
        return inserted
    with get_db() as conn:
        for item in body.items:
            conn.execute(
                "INSERT INTO items (user_id,dump_id,title,category,status,priority,area,due_date,notes) VALUES (?,?,?,?,?,?,?,?,?)",
                (user_id, body.dump_id, item.title, item.category,
                 "pendiente", item.priority or "media", item.area, item.due_date, item.notes)
            )
        if body.dump_id:
            conn.execute("UPDATE dumps SET status='processed' WHERE id=?", (body.dump_id,))
        conn.commit()
        rows = conn.execute(
            "SELECT * FROM items WHERE user_id=? ORDER BY id DESC LIMIT ?",
            (user_id, len(body.items))
        ).fetchall()
        return [dict(r) for r in reversed(rows)]

@app.delete("/api/dumps/{dump_id}", status_code=204)
def delete_dump(dump_id: int):
    if use_supabase():
        sb_delete("dumps", {"id": dump_id})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM dumps WHERE id=?", (dump_id,))
        conn.commit()


# ══════════════════════════════════════════════════════════════════════════════
# ITEMS (Tablero Kanban)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/items", response_model=List[ItemOut])
def get_items(user_id: int = 1,
              category: Optional[str] = Query(None),
              area: Optional[str] = Query(None),
              item_status: Optional[str] = Query(None, alias="status"),
              current_user: Optional[dict] = Depends(get_current_user)):
    user_id = resolve_effective_user_id(user_id, current_user)
    if use_supabase():
        return sb_select_multi_filter(
            "items",
            base_filters={"user_id": user_id},
            optional_filters={"category": category, "area": area, "status": item_status},
            order="id", desc=True,
        )
    sql = "SELECT * FROM items WHERE user_id=?"
    params: list = [user_id]
    if category:    sql += " AND category=?"; params.append(category)
    if area:        sql += " AND area=?";     params.append(area)
    if item_status: sql += " AND status=?";  params.append(item_status)
    sql += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]

@app.put("/api/items/{item_id}", response_model=ItemOut)
def update_item(item_id: int, body: ItemUpdate):
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Sin cambios")
    if use_supabase():
        updates["updated_at"] = now_iso()
        row = sb_update("items", item_id, updates)
        return row_or_404(row)
    updates_sql = list(updates.items())
    fields = [f"{k}=?" for k, _ in updates_sql] + ["updated_at=CURRENT_TIMESTAMP"]
    params = [v for _, v in updates_sql] + [item_id]
    with get_db() as conn:
        conn.execute(f"UPDATE items SET {', '.join(fields)} WHERE id=?", params)
        conn.commit()
        row = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    return row_or_404(row)

@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    if use_supabase():
        sb_delete("items", {"id": item_id})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM items WHERE id=?", (item_id,))
        conn.commit()


# ══════════════════════════════════════════════════════════════════════════════
# FACULTAD
# Formato Excel: Facu (1).xlsx — "Hoja 1"
# Cols: Nombre | Abreviatura | Cursado | Nivel | Cursada(Corr.) | Aprobada(Corr.) | Estado | Nota | TipoPromo
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/facu", response_model=List[FacuOut])
def get_facu(user_id: int = 1):
    if use_supabase():
        return sb_select("facu_materias", {"user_id": user_id}, order="name")
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM facu_materias WHERE user_id=? ORDER BY name", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/facu", response_model=FacuOut, status_code=201)
def create_facu(body: FacuCreate, user_id: int = 1):
    if use_supabase():
        return sb_insert("facu_materias", {
            "user_id": user_id, "name": body.name, "abbreviation": body.abbreviation,
            "cursado": body.cursado, "level": body.level,
            "correlativa_cursada": body.correlativa_cursada,
            "correlativa_aprobada": body.correlativa_aprobada,
            "status": body.status, "grade": body.grade, "condition_detail": body.condition_detail,
        })
    with get_db() as conn:
        conn.execute(
            """INSERT INTO facu_materias
               (user_id,name,abbreviation,cursado,level,correlativa_cursada,correlativa_aprobada,status,grade,condition_detail)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (user_id, body.name, body.abbreviation, body.cursado, body.level,
             body.correlativa_cursada, body.correlativa_aprobada,
             body.status, body.grade, body.condition_detail)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM facu_materias WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    return dict(row)

@app.put("/api/facu/{mid}", response_model=FacuOut)
def update_facu(mid: int, body: FacuCreate):
    data = {
        "name": body.name, "abbreviation": body.abbreviation,
        "cursado": body.cursado, "level": body.level,
        "correlativa_cursada": body.correlativa_cursada,
        "correlativa_aprobada": body.correlativa_aprobada,
        "status": body.status, "grade": body.grade, "condition_detail": body.condition_detail,
    }
    if use_supabase():
        row = sb_update("facu_materias", mid, data)
        return row_or_404(row)
    with get_db() as conn:
        conn.execute(
            """UPDATE facu_materias SET
               name=?,abbreviation=?,cursado=?,level=?,
               correlativa_cursada=?,correlativa_aprobada=?,
               status=?,grade=?,condition_detail=?
               WHERE id=?""",
            (body.name, body.abbreviation, body.cursado, body.level,
             body.correlativa_cursada, body.correlativa_aprobada,
             body.status, body.grade, body.condition_detail, mid)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM facu_materias WHERE id=?", (mid,)).fetchone()
    return row_or_404(row)

@app.delete("/api/facu/{mid}", status_code=204)
def delete_facu(mid: int):
    if use_supabase():
        sb_delete("facu_materias", {"id": mid})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM facu_materias WHERE id=?", (mid,))
        conn.commit()

@app.get("/api/facu/export")
def export_facu(user_id: int = 1):
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Hoja 1"

    headers = ["Nombre", "Abreviatura", "Cursado", "Nivel",
               "Cursada (Correlativa)", "Aprobada (Correlativa)",
               "Estado", "Nota", "Tipo Aprobacion"]
    ws.append(headers)
    _hdr_style(ws, 1, "1e40af")

    status_fills = {
        "Aprobada":  PatternFill("solid", fgColor="166534"),
        "Regular":   PatternFill("solid", fgColor="713f12"),
        "Cursando":  PatternFill("solid", fgColor="1e3a5f"),
        "NoCursada": PatternFill("solid", fgColor="374151"),
        "Libre":     PatternFill("solid", fgColor="7f1d1d"),
    }

    if use_supabase():
        rows = sb_select("facu_materias", {"user_id": user_id}, order="name")
    else:
        with get_db() as conn:
            rows = [dict(r) for r in conn.execute("SELECT * FROM facu_materias WHERE user_id=? ORDER BY name", (user_id,)).fetchall()]

    for r in rows:
        row_data = [
            r["name"], r["abbreviation"], r["cursado"], r["level"],
            r["correlativa_cursada"], r["correlativa_aprobada"],
            r["status"], r["grade"], r["condition_detail"]
        ]
        ws.append(row_data)
        fill = status_fills.get(r["status"] or "NoCursada")
        if fill:
            for cell in ws[ws.max_row]:
                cell.fill = fill
                cell.font = Font(color="FFFFFF")

    # Ajustar anchos
    for col in ws.columns:
        max_len = max((len(str(c.value)) if c.value else 0) for c in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Facu.xlsx"})

@app.post("/api/facu/import", status_code=201)
async def import_facu(file: UploadFile = File(...), user_id: int = 1):
    wb = openpyxl.load_workbook(io.BytesIO(await file.read()), data_only=True)
    ws = wb["Hoja 1"] if "Hoja 1" in wb.sheetnames else wb.active
    count = 0
    rows_to_insert = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0: continue  # skip header
        name = row[0]
        if not name: continue
        name = str(name).strip()
        abbr   = str(row[1]).strip() if row[1] else None
        cursado= str(row[2]).strip() if len(row) > 2 and row[2] else "C"
        level  = str(row[3]).strip() if len(row) > 3 and row[3] else "I"
        corr_c = str(row[4]).strip() if len(row) > 4 and row[4] else None
        corr_a = str(row[5]).strip() if len(row) > 5 and row[5] else None
        stat   = str(row[6]).strip() if len(row) > 6 and row[6] else "NoCursada"
        grade  = None
        if len(row) > 7 and row[7] is not None:
            try: grade = float(row[7])
            except: pass
        cond   = str(row[8]).strip() if len(row) > 8 and row[8] else None
        rows_to_insert.append({
            "user_id": user_id, "name": name, "abbreviation": abbr,
            "cursado": cursado, "level": level,
            "correlativa_cursada": corr_c, "correlativa_aprobada": corr_a,
            "status": stat, "grade": grade, "condition_detail": cond,
        })
        count += 1
    if use_supabase():
        if rows_to_insert:
            try:
                sb_insert_many("facu_materias", rows_to_insert)
            except Exception:
                # Si falla bulk (ej. duplicados), insertar uno a uno ignorando errores
                count = 0
                for r in rows_to_insert:
                    try: sb_insert("facu_materias", r); count += 1
                    except Exception: pass
    else:
        with get_db() as conn:
            for r in rows_to_insert:
                try:
                    conn.execute(
                        """INSERT OR IGNORE INTO facu_materias
                           (user_id,name,abbreviation,cursado,level,correlativa_cursada,correlativa_aprobada,status,grade,condition_detail)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (r["user_id"], r["name"], r["abbreviation"], r["cursado"], r["level"],
                         r["correlativa_cursada"], r["correlativa_aprobada"],
                         r["status"], r["grade"], r["condition_detail"])
                    )
                except Exception: pass
            conn.commit()
    return {"message": f"Se importaron {count} materias"}


# ══════════════════════════════════════════════════════════════════════════════
# FINANZAS
# Formato Excel: Finanzas 08_2026.xlsx — hojas: Gastos | Ingresos | Inversiones
#
# Gastos:    Fecha Alta | Fecha Pago | Descripcion | Monto | Categoria | Medio de Pago | Observacion
# Ingresos:  Fecha | Descripción | Monto | Categoria | Medio de Pago | Pagado a
# Inversiones: Fecha | Descripción | Plataforma | Precio Compra | Cantidad | Valor actual
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/finanzas", response_model=List[FinanzaOut])
def get_finanzas(user_id: int = 1):
    if use_supabase():
        return sb_select("finanzas", {"user_id": user_id}, order="id", desc=True)
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM finanzas WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/finanzas", response_model=FinanzaOut, status_code=201)
def create_finanza(body: FinanzaCreate, user_id: int = 1):
    if use_supabase():
        return sb_insert("finanzas", {
            "user_id": user_id, "type": body.type,
            "fecha_alta": body.fecha_alta, "fecha_pago": body.fecha_pago,
            "description": body.description, "amount": body.amount,
            "category": body.category, "payment_method": body.payment_method,
            "paid_to": body.paid_to, "notes": body.notes,
        })
    with get_db() as conn:
        conn.execute(
            """INSERT INTO finanzas
               (user_id,type,fecha_alta,fecha_pago,description,amount,category,payment_method,paid_to,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (user_id, body.type, body.fecha_alta, body.fecha_pago,
             body.description, body.amount, body.category,
             body.payment_method, body.paid_to, body.notes)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM finanzas WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    return dict(row)

@app.put("/api/finanzas/{fid}", response_model=FinanzaOut)
def update_finanza(fid: int, body: FinanzaCreate):
    data = {
        "type": body.type, "fecha_alta": body.fecha_alta, "fecha_pago": body.fecha_pago,
        "description": body.description, "amount": body.amount, "category": body.category,
        "payment_method": body.payment_method, "paid_to": body.paid_to, "notes": body.notes,
    }
    if use_supabase():
        row = sb_update("finanzas", fid, data)
        return row_or_404(row)
    with get_db() as conn:
        conn.execute(
            """UPDATE finanzas SET type=?,fecha_alta=?,fecha_pago=?,description=?,
               amount=?,category=?,payment_method=?,paid_to=?,notes=? WHERE id=?""",
            (body.type, body.fecha_alta, body.fecha_pago, body.description,
             body.amount, body.category, body.payment_method,
             body.paid_to, body.notes, fid)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM finanzas WHERE id=?", (fid,)).fetchone()
    return row_or_404(row)

@app.delete("/api/finanzas/{fid}", status_code=204)
def delete_finanza(fid: int):
    if use_supabase():
        sb_delete("finanzas", {"id": fid})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM finanzas WHERE id=?", (fid,))
        conn.commit()

@app.post("/api/finanzas/batch-delete")
def batch_delete_finanzas(body: BatchDeleteRequest, user_id: int = 1):
    if not body.ids:
        return {"deleted": 0}
    if use_supabase():
        sb_delete_in("finanzas", "id", body.ids, {"user_id": user_id})
        return {"deleted": len(body.ids)}
    with get_db() as conn:
        placeholders = ",".join("?" for _ in body.ids)
        conn.execute(f"DELETE FROM finanzas WHERE user_id=? AND id IN ({placeholders})", [user_id] + body.ids)
        conn.commit()
    return {"deleted": len(body.ids)}

# ── Inversiones ──────────────────────────────────────────────
@app.get("/api/inversiones", response_model=List[InversionOut])
def get_inversiones(user_id: int = 1):
    if use_supabase():
        return sb_select("inversiones", {"user_id": user_id}, order="id", desc=True)
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM inversiones WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/inversiones", response_model=InversionOut, status_code=201)
def create_inversion(body: InversionCreate, user_id: int = 1):
    if use_supabase():
        return sb_insert("inversiones", {
            "user_id": user_id, "fecha": body.fecha, "description": body.description,
            "platform": body.platform, "buy_price": body.buy_price,
            "quantity": body.quantity, "current_val": body.current_val,
        })
    with get_db() as conn:
        conn.execute(
            "INSERT INTO inversiones (user_id,fecha,description,platform,buy_price,quantity,current_val) VALUES (?,?,?,?,?,?,?)",
            (user_id, body.fecha, body.description, body.platform, body.buy_price, body.quantity, body.current_val)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM inversiones WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    return dict(row)

@app.delete("/api/inversiones/{inv_id}", status_code=204)
def delete_inversion(inv_id: int):
    if use_supabase():
        sb_delete("inversiones", {"id": inv_id})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM inversiones WHERE id=?", (inv_id,))
        conn.commit()

@app.get("/api/finanzas/export")
def export_finanzas(user_id: int = 1):
    wb = openpyxl.Workbook()

    # ── Hoja Gastos ──────────────────────────────────────────
    ws_g = wb.active; ws_g.title = "Gastos"
    ws_g.append(["Fecha Alta", "Fecha Pago", "Descripcion", "Monto",
                 "Categoria", "Medio de Pago", "Observacion"])
    _hdr_style(ws_g, 1, "7f1d1d")
    if use_supabase():
        gastos = sb_select_multi_filter("finanzas", {"user_id": user_id, "type": "gasto"}, order="id", desc=True)
    else:
        with get_db() as conn:
            gastos = [dict(r) for r in conn.execute(
                "SELECT * FROM finanzas WHERE user_id=? AND type='gasto' ORDER BY id DESC", (user_id,)
            ).fetchall()]
    for r in gastos:
        ws_g.append([r["fecha_alta"] or "", r["fecha_pago"],
                     r["description"], r["amount"],
                     r["category"], r["payment_method"], r["notes"] or ""])

    # ── Hoja Ingresos ─────────────────────────────────────────
    ws_i = wb.create_sheet("Ingresos")
    ws_i.append(["Fecha", "Descripción", "Monto", "Categoria", "Medio de Pago", "Pagado a"])
    _hdr_style(ws_i, 1, "14532d")
    if use_supabase():
        ingresos = sb_select_multi_filter("finanzas", {"user_id": user_id, "type": "ingreso"}, order="id", desc=True)
    else:
        with get_db() as conn:
            ingresos = [dict(r) for r in conn.execute(
                "SELECT * FROM finanzas WHERE user_id=? AND type='ingreso' ORDER BY id DESC", (user_id,)
            ).fetchall()]
    for r in ingresos:
        ws_i.append([r["fecha_pago"], r["description"], r["amount"],
                     r["category"], r["payment_method"], r.get("paid_to") or ""])

    # ── Hoja Inversiones ──────────────────────────────────────
    ws_inv = wb.create_sheet("Inversiones")
    ws_inv.append(["Fecha", "Descripción", "Plataforma",
                   "Precio de Compra Promedio", "Cantidad", "Valor actual"])
    _hdr_style(ws_inv, 1, "1e3a5f")
    if use_supabase():
        invs = sb_select("inversiones", {"user_id": user_id}, order="id")
    else:
        with get_db() as conn:
            invs = [dict(r) for r in conn.execute("SELECT * FROM inversiones WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    for r in invs:
        ws_inv.append([r["fecha"] or "", r["description"], r["platform"] or "",
                       r["buy_price"], r["quantity"], r["current_val"]])

    # Ajustar anchos
    for ws in [ws_g, ws_i, ws_inv]:
        for col in ws.columns:
            max_len = max((len(str(c.value)) if c.value else 0) for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 45)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Finanzas.xlsx"})

@app.post("/api/finanzas/import", status_code=201)
async def import_finanzas(file: UploadFile = File(...), user_id: int = 1):
    wb = openpyxl.load_workbook(io.BytesIO(await file.read()), data_only=True)
    count = 0
    gastos_rows, ingresos_rows, inv_rows = [], [], []

    # Hoja Gastos
    if "Gastos" in wb.sheetnames:
        ws = wb["Gastos"]
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0: continue
            desc = row[2] if len(row) > 2 else None
            amt  = row[3] if len(row) > 3 else None
            if not desc or amt is None: continue
            try: amt = float(amt)
            except: continue
            gastos_rows.append({
                "user_id": user_id, "type": "gasto",
                "fecha_alta": fmt_date(row[0]) if row[0] else None,
                "fecha_pago": fmt_date(row[1]) if row[1] else today_str(),
                "description": str(desc).strip(), "amount": amt,
                "category": str(row[4]).strip() if len(row) > 4 and row[4] else "Varios",
                "payment_method": str(row[5]).strip() if len(row) > 5 and row[5] else "Efectivo",
                "notes": str(row[6]).strip() if len(row) > 6 and row[6] else None,
            })
            count += 1

    # Hoja Ingresos
    if "Ingresos" in wb.sheetnames:
        ws = wb["Ingresos"]
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0: continue
            desc = row[1] if len(row) > 1 else None
            amt  = row[2] if len(row) > 2 else None
            if not desc or amt is None: continue
            try: amt = float(amt)
            except: continue
            ingresos_rows.append({
                "user_id": user_id, "type": "ingreso",
                "fecha_pago": fmt_date(row[0]) if row[0] else today_str(),
                "description": str(desc).strip(), "amount": amt,
                "category": str(row[3]).strip() if len(row) > 3 and row[3] else "Varios",
                "payment_method": str(row[4]).strip() if len(row) > 4 and row[4] else "Efectivo",
                "paid_to": str(row[5]).strip() if len(row) > 5 and row[5] else None,
            })
            count += 1

    # Hoja Inversiones
    if "Inversiones" in wb.sheetnames:
        ws = wb["Inversiones"]
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0: continue
            desc = row[1] if len(row) > 1 else None
            if not desc: continue
            try: qty = float(row[4]) if len(row) > 4 and row[4] else None
            except: qty = None
            try: val = float(row[5]) if len(row) > 5 and row[5] else None
            except: val = None
            try: bp = float(row[3]) if len(row) > 3 and row[3] else None
            except: bp = None
            inv_rows.append({
                "user_id": user_id,
                "fecha": fmt_date(row[0]) if row[0] else None,
                "description": str(desc).strip(),
                "platform": str(row[2]).strip() if len(row) > 2 and row[2] else None,
                "buy_price": bp, "quantity": qty, "current_val": val,
            })
            count += 1

    if use_supabase():
        if gastos_rows:   sb_insert_many("finanzas",   gastos_rows)
        if ingresos_rows: sb_insert_many("finanzas",   ingresos_rows)
        if inv_rows:      sb_insert_many("inversiones", inv_rows)
    else:
        with get_db() as conn:
            for r in gastos_rows:
                conn.execute(
                    "INSERT INTO finanzas (user_id,type,fecha_alta,fecha_pago,description,amount,category,payment_method,notes) VALUES (?,?,?,?,?,?,?,?,?)",
                    (r["user_id"], r["type"], r["fecha_alta"], r["fecha_pago"],
                     r["description"], r["amount"], r["category"], r["payment_method"], r["notes"])
                )
            for r in ingresos_rows:
                conn.execute(
                    "INSERT INTO finanzas (user_id,type,fecha_pago,description,amount,category,payment_method,paid_to) VALUES (?,?,?,?,?,?,?,?)",
                    (r["user_id"], r["type"], r["fecha_pago"], r["description"],
                     r["amount"], r["category"], r["payment_method"], r["paid_to"])
                )
            for r in inv_rows:
                conn.execute(
                    "INSERT INTO inversiones (user_id,fecha,description,platform,buy_price,quantity,current_val) VALUES (?,?,?,?,?,?,?)",
                    (r["user_id"], r["fecha"], r["description"], r["platform"],
                     r["buy_price"], r["quantity"], r["current_val"])
                )
            conn.commit()
    return {"message": f"Se importaron {count} registros financieros"}


# ══════════════════════════════════════════════════════════════════════════════
# PEDIDOS 3D
# Formato Excel: Pedidos3D.xlsx — hojas: Pedidos | Costos
#
# Pedidos: Cliente | Vendedor | Producto | Fecha Pedido | Precio |
#          Fecha Entrega | Tiempo | Gramos | Estado | Prioridad | Observacion
# Costos:  hoja con parámetros de calculadora (se importa como referencia)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/pedidos", response_model=List[PedidoOut])
def get_pedidos(user_id: int = 1, estado: Optional[str] = Query(None)):
    if use_supabase():
        return sb_select_multi_filter(
            "pedidos3d",
            base_filters={"user_id": user_id},
            optional_filters={"status": estado},
            order="id", desc=True,
        )
    sql = "SELECT * FROM pedidos3d WHERE user_id=?"
    params: list = [user_id]
    if estado: sql += " AND status=?"; params.append(estado)
    sql += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/pedidos", response_model=PedidoOut, status_code=201)
def create_pedido(body: PedidoCreate, user_id: int = 1):
    if use_supabase():
        return sb_insert("pedidos3d", {
            "user_id": user_id, "client": body.client, "seller": body.seller,
            "product": body.product, "order_date": body.order_date,
            "delivery_date": body.delivery_date, "price": body.price,
            "time_str": body.time_str, "grams_str": body.grams_str, "hours": body.hours,
            "status": body.status, "priority": body.priority, "notes": body.notes,
        })
    with get_db() as conn:
        conn.execute(
            """INSERT INTO pedidos3d
               (user_id,client,seller,product,order_date,delivery_date,price,time_str,grams_str,hours,status,priority,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (user_id, body.client, body.seller, body.product,
             body.order_date, body.delivery_date, body.price,
             body.time_str, body.grams_str, body.hours,
             body.status, body.priority, body.notes)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM pedidos3d WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    return dict(row)

@app.put("/api/pedidos/{pid}", response_model=PedidoOut)
def update_pedido(pid: int, body: PedidoCreate):
    data = {
        "client": body.client, "seller": body.seller, "product": body.product,
        "order_date": body.order_date, "delivery_date": body.delivery_date,
        "price": body.price, "time_str": body.time_str, "grams_str": body.grams_str,
        "hours": body.hours, "status": body.status, "priority": body.priority, "notes": body.notes,
    }
    if use_supabase():
        row = sb_update("pedidos3d", pid, data)
        return row_or_404(row)
    with get_db() as conn:
        conn.execute(
            """UPDATE pedidos3d SET client=?,seller=?,product=?,order_date=?,delivery_date=?,
               price=?,time_str=?,grams_str=?,hours=?,status=?,priority=?,notes=? WHERE id=?""",
            (body.client, body.seller, body.product, body.order_date,
             body.delivery_date, body.price, body.time_str, body.grams_str,
             body.hours, body.status, body.priority, body.notes, pid)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM pedidos3d WHERE id=?", (pid,)).fetchone()
    return row_or_404(row)

@app.delete("/api/pedidos/{pid}", status_code=204)
def delete_pedido(pid: int):
    if use_supabase():
        sb_delete("pedidos3d", {"id": pid})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM pedidos3d WHERE id=?", (pid,))
        conn.commit()

@app.get("/api/pedidos/export")
def export_pedidos(user_id: int = 1):
    wb = openpyxl.Workbook()

    # ── Hoja Pedidos ──────────────────────────────────────────
    ws_p = wb.active; ws_p.title = "Pedidos"
    ws_p.append(["Cliente", "Vendedor", "Producto", "Fecha Pedido", "Precio",
                 "Fecha Entrega", "Tiempo", "Gramos", "Estado", "Prioridad", "Observacion"])
    _hdr_style(ws_p, 1, "4c1d95")

    status_fills = {
        "Diseño":       PatternFill("solid", fgColor="1e3a5f"),
        "Imprimiendo":  PatternFill("solid", fgColor="164e63"),
        "Post-proceso": PatternFill("solid", fgColor="78350f"),
        "Pintado":      PatternFill("solid", fgColor="4c1d95"),
        "Listo":        PatternFill("solid", fgColor="14532d"),
        "Entregado":    PatternFill("solid", fgColor="166534"),
        "Cancelado":    PatternFill("solid", fgColor="7f1d1d"),
    }

    if use_supabase():
        rows = sb_select("pedidos3d", {"user_id": user_id}, order="id", desc=True)
    else:
        with get_db() as conn:
            rows = [dict(r) for r in conn.execute("SELECT * FROM pedidos3d WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()]
    for r in rows:
        ws_p.append([
            r["client"], r["seller"] or "", r["product"],
            r["order_date"], r["price"] if r["price"] else "",
            r["delivery_date"] or "", r["time_str"] or "", r["grams_str"] or "",
            r["status"], r["priority"] or "", r["notes"] or ""
        ])
        fill = status_fills.get(r["status"])
        if fill:
            for cell in ws_p[ws_p.max_row]:
                cell.fill = fill
                cell.font = Font(color="FFFFFF")

    # ── Hoja Costos (calculadora) ─────────────────────────────
    ws_c = wb.create_sheet("Costos")
    ws_c.append(["Gramos", "Horas Maquina", "Costo estimado", "", "", "Nombre de valor", "Valor"])
    _hdr_style(ws_c, 1, "1e293b")
    ws_c.append([None, None, None, None, None, "Precio KWH  (Pesos) =", 350])
    ws_c.append([170, 6, "=G3/1000*170 + G4*6", None, None, "Consumo promedio por hora (KWH) =", 0.15])
    ws_c.append([None, None, None, None, None, "Precio promedio kg filamento (Pesos) =", 17000])
    ws_c.append([None, None, None, None, None, "Precio promedio por hora (Pesos) =", 52.5])

    for ws in [ws_p, ws_c]:
        for col in ws.columns:
            max_len = max((len(str(c.value)) if c.value else 0) for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Pedidos3D.xlsx"})

@app.post("/api/pedidos/import", status_code=201)
async def import_pedidos(file: UploadFile = File(...), user_id: int = 1):
    wb = openpyxl.load_workbook(io.BytesIO(await file.read()), data_only=True)
    ws = wb["Pedidos"] if "Pedidos" in wb.sheetnames else wb.active
    count = 0
    pedidos_rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0: continue
        client  = row[0] if row[0] else None
        product = row[2] if len(row) > 2 and row[2] else None
        if not client or not product: continue
        try: price = float(row[4]) if len(row) > 4 and row[4] else None
        except: price = None
        pedidos_rows.append({
            "user_id": user_id,
            "client": str(client).strip(),
            "seller": str(row[1]).strip() if len(row) > 1 and row[1] else None,
            "product": str(product).strip(),
            "order_date": fmt_date(row[3]) if len(row) > 3 and row[3] else today_str(),
            "delivery_date": fmt_date(row[5]) if len(row) > 5 and row[5] else None,
            "price": price,
            "time_str": str(row[6]).strip() if len(row) > 6 and row[6] else None,
            "grams_str": str(row[7]).strip() if len(row) > 7 and row[7] else None,
            "status": str(row[8]).strip() if len(row) > 8 and row[8] else "Diseño",
            "priority": str(row[9]).strip() if len(row) > 9 and row[9] else "media",
            "notes": str(row[10]).strip() if len(row) > 10 and row[10] else None,
        })
        count += 1
    if use_supabase():
        if pedidos_rows: sb_insert_many("pedidos3d", pedidos_rows)
    else:
        with get_db() as conn:
            for r in pedidos_rows:
                conn.execute(
                    "INSERT INTO pedidos3d (user_id,client,seller,product,order_date,delivery_date,price,time_str,grams_str,status,priority,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (r["user_id"], r["client"], r["seller"], r["product"],
                     r["order_date"], r["delivery_date"], r["price"],
                     r["time_str"], r["grams_str"], r["status"], r["priority"], r["notes"])
                )
            conn.commit()
    return {"message": f"Se importaron {count} pedidos"}


# ══════════════════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/stats")
def get_stats(user_id: int = 1, current_user: Optional[dict] = Depends(get_current_user)):
    user_id = resolve_effective_user_id(user_id, current_user)
    if use_supabase():
        pending  = sb_count("items",    {"user_id": user_id, "status": "pendiente"})
        # Pedidos activos: todos menos Entregado y Cancelado
        all_ped  = get_sb().table("pedidos3d").select("status").eq("user_id", user_id).execute().data or []
        pedidos  = sum(1 for r in all_ped if r.get("status") not in ("Entregado", "Cancelado"))
        ingresos = sb_sum("finanzas", "amount", {"user_id": user_id, "type": "ingreso"})
        gastos   = sb_sum("finanzas", "amount", {"user_id": user_id, "type": "gasto"})
        return {"pending": pending, "active_pedidos": pedidos, "balance": ingresos - gastos}
    with get_db() as conn:
        pending  = conn.execute("SELECT COUNT(*) FROM items WHERE user_id=? AND status='pendiente'", (user_id,)).fetchone()[0]
        pedidos  = conn.execute("SELECT COUNT(*) FROM pedidos3d WHERE user_id=? AND status NOT IN ('Entregado','Cancelado')", (user_id,)).fetchone()[0]
        ingresos = conn.execute("SELECT COALESCE(SUM(amount),0) FROM finanzas WHERE user_id=? AND type='ingreso'", (user_id,)).fetchone()[0]
        gastos   = conn.execute("SELECT COALESCE(SUM(amount),0) FROM finanzas WHERE user_id=? AND type='gasto'", (user_id,)).fetchone()[0]
    return {"pending": pending, "active_pedidos": pedidos, "balance": ingresos - gastos}


# ══════════════════════════════════════════════════════════════════════════════
# FRONTEND ESTÁTICO
# ══════════════════════════════════════════════════════════════════════════════
FRONTEND = Path(__file__).parent.parent / "frontend"
if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
