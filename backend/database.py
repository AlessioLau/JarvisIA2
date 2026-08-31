"""database.py — Esquema SQLite limpio para JarvisIA2"""
from __future__ import annotations
import sqlite3, hashlib, os, shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

if os.getenv("VERCEL"):
    DB_PATH = Path("/tmp/jarvis.db")
    ORIG_DB = BASE_DIR / "data" / "jarvis.db"
    if not DB_PATH.exists() and ORIG_DB.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ORIG_DB, DB_PATH)
else:
    DB_PATH = BASE_DIR / "data" / "jarvis.db"



def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        c = conn.cursor()
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name          TEXT NOT NULL DEFAULT '',
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            name        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#3b82f6',
            description TEXT,
            UNIQUE(user_id, name)
        );
        CREATE TABLE IF NOT EXISTS areas (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            name        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#8b5cf6',
            icon        TEXT NOT NULL DEFAULT 'fa-layer-group',
            description TEXT,
            UNIQUE(user_id, name)
        );
        CREATE TABLE IF NOT EXISTS rules (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL DEFAULT 1,
            keyword      TEXT NOT NULL,
            target_type  TEXT NOT NULL,
            target_value TEXT NOT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS dumps (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL DEFAULT 1,
            original_text TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'pending',
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            dump_id     INTEGER,
            title       TEXT NOT NULL,
            category    TEXT NOT NULL DEFAULT 'tarea',
            status      TEXT NOT NULL DEFAULT 'pendiente',
            priority    TEXT NOT NULL DEFAULT 'media',
            area        TEXT,
            due_date    TEXT,
            notes       TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS facu_materias (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id               INTEGER NOT NULL DEFAULT 1,
            name                  TEXT NOT NULL,
            abbreviation          TEXT,
            cursado               TEXT DEFAULT 'C',
            level                 TEXT DEFAULT 'I',
            correlativa_cursada   TEXT,
            correlativa_aprobada  TEXT,
            status                TEXT NOT NULL DEFAULT 'Cursando',
            grade                 REAL,
            condition_detail      TEXT,
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS finanzas (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER NOT NULL DEFAULT 1,
            type           TEXT NOT NULL,
            fecha_alta     TEXT,
            fecha_pago     TEXT NOT NULL,
            description    TEXT NOT NULL,
            amount         REAL NOT NULL,
            category       TEXT NOT NULL DEFAULT 'Varios',
            payment_method TEXT NOT NULL DEFAULT 'Efectivo',
            paid_to        TEXT,
            notes          TEXT,
            created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS inversiones (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            fecha       TEXT,
            description TEXT NOT NULL,
            platform    TEXT,
            buy_price   REAL,
            quantity    REAL,
            current_val REAL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS pedidos3d (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL DEFAULT 1,
            client        TEXT NOT NULL,
            seller        TEXT,
            product       TEXT NOT NULL,
            order_date    TEXT NOT NULL,
            delivery_date TEXT,
            price         REAL,
            time_str      TEXT,
            grams_str     TEXT,
            hours         REAL,
            status        TEXT NOT NULL DEFAULT 'Diseño',
            priority      TEXT NOT NULL DEFAULT 'media',
            notes         TEXT,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Seed if no users
        c.execute("SELECT COUNT(*) FROM users")
        if c.fetchone()[0] == 0:
            pw = hashlib.sha256("1234".encode()).hexdigest()
            c.execute("INSERT INTO users (username, password_hash, name) VALUES (?,?,?)",
                      ("admin", pw, "Lau Admin"))
            uid = c.lastrowid

            # Categories
            cats = [
                (uid, "tarea",        "#3b82f6", "Acción concreta a realizar"),
                (uid, "proyecto",     "#8b5cf6", "Conjunto de tareas relacionadas"),
                (uid, "idea",         "#f59e0b", "Pensamiento o iniciativa futura"),
                (uid, "nota",         "#06b6d4", "Información de referencia"),
                (uid, "recordatorio", "#10b981", "Fecha o evento a no olvidar"),
                (uid, "área",         "#ec4899", "Responsabilidad o rol principal"),
            ]
            c.executemany("INSERT OR IGNORE INTO categories (user_id,name,color,description) VALUES (?,?,?,?)", cats)

            # Areas
            areas = [
                (uid, "Facultad",         "#8b5cf6", "fa-graduation-cap", "Materias y exámenes"),
                (uid, "Emprendimiento 3D","#ec4899",  "fa-cube",           "Pedidos e impresiones 3D"),
                (uid, "Finanzas",         "#10b981",  "fa-wallet",         "Gastos e ingresos"),
                (uid, "Personal",         "#3b82f6",  "fa-user",           "Tareas personales"),
                (uid, "Trabajo",          "#f59e0b",  "fa-briefcase",      "Responsabilidades laborales"),
            ]
            c.executemany("INSERT OR IGNORE INTO areas (user_id,name,color,icon,description) VALUES (?,?,?,?,?)", areas)

            # Rules (keyword, target_type, target_value)
            rules = [
                # Áreas
                (uid,"facultad",   "area","Facultad"),
                (uid,"materia",    "area","Facultad"),
                (uid,"parcial",    "area","Facultad"),
                (uid,"examen",     "area","Facultad"),
                (uid,"cursada",    "area","Facultad"),
                (uid,"3d",         "area","Emprendimiento 3D"),
                (uid,"impresora",  "area","Emprendimiento 3D"),
                (uid,"filamento",  "area","Emprendimiento 3D"),
                (uid,"imprimir",   "area","Emprendimiento 3D"),
                (uid,"modelar",    "area","Emprendimiento 3D"),
                (uid,"pedido",     "area","Emprendimiento 3D"),
                (uid,"repuesto",   "area","Emprendimiento 3D"),
                (uid,"pesos",      "area","Finanzas"),
                (uid,"precio",     "area","Finanzas"),
                (uid,"pagar",      "area","Finanzas"),
                (uid,"gasto",      "area","Finanzas"),
                (uid,"cobrar",     "area","Finanzas"),
                (uid,"casa",       "area","Personal"),
                (uid,"comprar",    "area","Personal"),
                # Categorías
                (uid,"idea",       "category","idea"),
                (uid,"se me ocurrió","category","idea"),
                (uid,"estaría bueno","category","idea"),
                (uid,"recordar",   "category","recordatorio"),
                (uid,"no olvidar", "category","recordatorio"),
                (uid,"nota",       "category","nota"),
                (uid,"clave",      "category","nota"),
                (uid,"contraseña", "category","nota"),
                # Prioridades
                (uid,"urgente",    "priority","alta"),
                (uid,"hoy",        "priority","alta"),
                (uid,"ya",         "priority","alta"),
                (uid,"asap",       "priority","alta"),
                (uid,"con tiempo", "priority","baja"),
                (uid,"después",    "priority","baja"),
                (uid,"cuando pueda","priority","baja"),
                # Contexto
                (uid,"computadora","context","computadora"),
                (uid,"pc",         "context","computadora"),
                (uid,"taller",     "context","taller 3D"),
            ]
            c.executemany("INSERT INTO rules (user_id,keyword,target_type,target_value) VALUES (?,?,?,?)", rules)
        conn.commit()
