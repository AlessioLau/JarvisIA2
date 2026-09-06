"""database.py — Abstracción de BD para JarvisIA2 (Supabase REST API + SQLite fallback)"""
from __future__ import annotations
import os, sqlite3, shutil, hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path("/tmp/jarvis.db") if os.getenv("VERCEL") else (BASE_DIR / "data" / "jarvis.db")

# ── Cargar .env ───────────────────────────────────────────────────────────────
for _env_path in [BASE_DIR / ".env", BASE_DIR.parent / ".env"]:
    if _env_path.exists():
        try:
            with open(_env_path, "r", encoding="utf-8") as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line and not _line.startswith("#") and "=" in _line:
                        _k, _v = _line.split("=", 1)
                        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
        except Exception:
            pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
# Soporta tanto SUPABASE_SECRET_KEY (nuevo formato) como SUPABASE_KEY (legacy)
SUPABASE_KEY = (
    os.getenv("SUPABASE_SECRET_KEY")
    or os.getenv("SUPABASE_KEY")
    or ""
).strip()
SUPABASE_PUBLISHABLE_KEY = (
    os.getenv("SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or ""
).strip()

_sb_client = None


# ── Cliente Supabase ──────────────────────────────────────────────────────────

def use_supabase() -> bool:
    """True si las credenciales de Supabase están configuradas."""
    return bool(SUPABASE_URL and SUPABASE_KEY)


def get_sb():
    """Devuelve el cliente supabase-py (singleton, lazy init)."""
    global _sb_client
    if _sb_client is None:
        if not use_supabase():
            raise RuntimeError(
                "Supabase no configurado — verificá SUPABASE_URL y SUPABASE_SECRET_KEY en .env"
            )
        from supabase import create_client
        _sb_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _sb_client


# ── Helpers CRUD (Supabase) ───────────────────────────────────────────────────

def sb_select(
    table: str,
    filters: Optional[Dict] = None,
    order: str = "id",
    desc: bool = False,
    limit: Optional[int] = None,
) -> List[dict]:
    """SELECT * FROM table WHERE filters ORDER BY order [DESC] [LIMIT limit]."""
    q = get_sb().table(table).select("*")
    for k, v in (filters or {}).items():
        q = q.eq(k, v)
    q = q.order(order, desc=desc)
    if limit:
        q = q.limit(limit)
    return q.execute().data or []


def sb_select_multi_filter(
    table: str,
    base_filters: Dict,
    optional_filters: Optional[Dict] = None,
    order: str = "id",
    desc: bool = False,
) -> List[dict]:
    """SELECT con filtros obligatorios + filtros opcionales (None se ignoran)."""
    q = get_sb().table(table).select("*")
    for k, v in base_filters.items():
        q = q.eq(k, v)
    for k, v in (optional_filters or {}).items():
        if v is not None:
            q = q.eq(k, v)
    return q.order(order, desc=desc).execute().data or []


def sb_get_one(table: str, filters: Dict) -> Optional[dict]:
    """Devuelve la primera fila que coincide con los filtros, o None."""
    q = get_sb().table(table).select("*")
    for k, v in filters.items():
        q = q.eq(k, v)
    res = q.limit(1).execute()
    return res.data[0] if res.data else None


def sb_insert(table: str, data: Dict) -> dict:
    """INSERT INTO table ... RETURNING *. Devuelve la fila insertada."""
    res = get_sb().table(table).insert(data).execute()
    if not res.data:
        raise RuntimeError(f"Insert en '{table}' no devolvió datos: {res}")
    return res.data[0]


def sb_insert_many(table: str, rows: List[Dict]) -> List[dict]:
    """INSERT bulk. Devuelve lista de filas insertadas."""
    if not rows:
        return []
    res = get_sb().table(table).insert(rows).execute()
    return res.data or []


def sb_update(table: str, row_id: int, data: Dict) -> dict:
    """UPDATE table SET data WHERE id=row_id. Devuelve la fila actualizada."""
    res = get_sb().table(table).update(data).eq("id", row_id).execute()
    if not res.data:
        raise RuntimeError(f"Update en '{table}' id={row_id} no devolvió datos")
    return res.data[0]


def sb_delete(table: str, filters: Dict) -> None:
    """DELETE FROM table WHERE filters."""
    q = get_sb().table(table).delete()
    for k, v in filters.items():
        q = q.eq(k, v)
    q.execute()


def sb_count(table: str, filters: Dict) -> int:
    """Cuenta filas que coinciden con los filtros."""
    q = get_sb().table(table).select("id", count="exact")
    for k, v in filters.items():
        q = q.eq(k, v)
    res = q.execute()
    return res.count or 0


def sb_sum(table: str, column: str, filters: Dict) -> float:
    """Suma una columna filtrando por filters. Suma en Python."""
    q = get_sb().table(table).select(column)
    for k, v in filters.items():
        q = q.eq(k, v)
    res = q.execute()
    return sum(float(r[column] or 0) for r in (res.data or []))


def now_iso() -> str:
    """Timestamp ISO 8601 UTC para usar en updated_at."""
    return datetime.now(timezone.utc).isoformat()


# ── SQLite fallback ───────────────────────────────────────────────────────────

class _DictRow(dict):
    """dict que además soporta acceso por índice entero."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class _Cursor:
    def __init__(self, raw_cursor, raw_conn):
        self._cur = raw_cursor
        self._conn = raw_conn
        self.lastrowid: Optional[int] = None

    def _cols(self):
        return [d[0] for d in (self._cur.description or [])]

    def execute(self, sql: str, params=()):
        self._cur.execute(sql, params)
        self.lastrowid = self._cur.lastrowid
        return self

    def executemany(self, sql: str, seq):
        self._cur.executemany(sql, seq)
        return self

    def executescript(self, sql: str):
        self._conn.executescript(sql)
        return self

    def fetchone(self) -> Optional[_DictRow]:
        row = self._cur.fetchone()
        if row is None:
            return None
        cols = self._cols()
        return _DictRow(zip(cols, row)) if cols else _DictRow(enumerate(row))

    def fetchall(self) -> List[_DictRow]:
        cols = self._cols()
        return [_DictRow(zip(cols, r)) for r in self._cur.fetchall()]


class _SQLiteConn:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def cursor(self) -> _Cursor:
        return _Cursor(self._conn.cursor(), self._conn)

    def execute(self, sql: str, params=()):
        cur = _Cursor(self._conn.cursor(), self._conn)
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()


def get_db() -> _SQLiteConn:
    """Conexión SQLite local (fallback cuando Supabase no está configurado)."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if os.getenv("VERCEL"):
        orig = BASE_DIR / "data" / "jarvis.db"
        if not DB_PATH.exists() and orig.exists():
            shutil.copy2(orig, DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = None
    conn.execute("PRAGMA foreign_keys = ON")
    return _SQLiteConn(conn)


def init_db() -> None:
    """Inicializa la BD. Si Supabase está configurado, el schema ya existe allá."""
    if use_supabase():
        print("[Info] Supabase configurado — usando API REST.")
        return

    print("[Warning] Supabase no configurado — usando SQLite local.")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(DB_PATH)
    raw.execute("PRAGMA foreign_keys = ON")
    raw.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6', description TEXT,
        UNIQUE(user_id, name)
    );
    CREATE TABLE IF NOT EXISTS areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#8b5cf6',
        icon TEXT NOT NULL DEFAULT 'fa-layer-group', description TEXT,
        UNIQUE(user_id, name)
    );
    CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        keyword TEXT NOT NULL, target_type TEXT NOT NULL, target_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS dumps (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        original_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        dump_id INTEGER, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'tarea',
        status TEXT NOT NULL DEFAULT 'pendiente', priority TEXT NOT NULL DEFAULT 'media',
        area TEXT, due_date TEXT, notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS facu_materias (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL, abbreviation TEXT, cursado TEXT DEFAULT 'C', level TEXT DEFAULT 'I',
        correlativa_cursada TEXT, correlativa_aprobada TEXT,
        status TEXT NOT NULL DEFAULT 'Cursando', grade REAL, condition_detail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS finanzas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        type TEXT NOT NULL, fecha_alta TEXT, fecha_pago TEXT NOT NULL,
        description TEXT NOT NULL, amount REAL NOT NULL,
        category TEXT NOT NULL DEFAULT 'Varios',
        payment_method TEXT NOT NULL DEFAULT 'Efectivo',
        paid_to TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inversiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        fecha TEXT, description TEXT NOT NULL, platform TEXT,
        buy_price REAL, quantity REAL, current_val REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pedidos3d (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 1,
        client TEXT NOT NULL, seller TEXT, product TEXT NOT NULL,
        order_date TEXT NOT NULL, delivery_date TEXT, price REAL,
        time_str TEXT, grams_str TEXT, hours REAL,
        status TEXT NOT NULL DEFAULT 'Diseño', priority TEXT NOT NULL DEFAULT 'media',
        notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Seed usuario admin si la tabla está vacía
    row = raw.execute("SELECT COUNT(*) FROM users").fetchone()
    if row[0] == 0:
        pw = hashlib.sha256("1234".encode()).hexdigest()
        cur = raw.execute(
            "INSERT INTO users (username, password_hash, name, role) VALUES (?,?,?,?)",
            ("admin", pw, "Lau Admin", "admin"),
        )
        uid = cur.lastrowid
        raw.executemany(
            "INSERT OR IGNORE INTO categories (user_id,name,color,description) VALUES (?,?,?,?)",
            [
                (uid, "tarea",        "#3b82f6", "Acción concreta a realizar"),
                (uid, "proyecto",     "#8b5cf6", "Conjunto de tareas relacionadas"),
                (uid, "idea",         "#f59e0b", "Pensamiento o iniciativa futura"),
                (uid, "nota",         "#06b6d4", "Información de referencia"),
                (uid, "recordatorio", "#10b981", "Fecha o evento a no olvidar"),
                (uid, "área",         "#ec4899", "Responsabilidad o rol principal"),
            ],
        )
        raw.executemany(
            "INSERT OR IGNORE INTO areas (user_id,name,color,icon,description) VALUES (?,?,?,?,?)",
            [
                (uid, "Facultad",          "#8b5cf6", "fa-graduation-cap", "Materias y exámenes"),
                (uid, "Emprendimiento 3D", "#ec4899", "fa-cube",           "Pedidos e impresiones 3D"),
                (uid, "Finanzas",          "#10b981", "fa-wallet",         "Gastos e ingresos"),
                (uid, "Personal",          "#3b82f6", "fa-user",           "Tareas personales"),
                (uid, "Trabajo",           "#f59e0b", "fa-briefcase",      "Responsabilidades laborales"),
            ],
        )
    raw.commit()
    raw.close()
