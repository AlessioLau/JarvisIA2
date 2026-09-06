"""auth_service.py — Registro, Login y Tokens de usuarios para JarvisIA2"""
from __future__ import annotations
import os, hmac, hashlib, base64, json, time
from typing import Optional, Dict
from database import get_db, use_supabase, sb_get_one, sb_insert

# Clave secreta para firmar tokens
AUTH_SECRET = os.getenv("AUTH_SECRET") or os.getenv("SUPABASE_SECRET_KEY") or "jarvis-secret-fallback-key-2026"

def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def generate_token(user: Dict) -> str:
    """Genera un token firmado stateless (header.payload.signature) similar a JWT."""
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user.get("role", "user"),
        "name": user.get("name", ""),
        "iat": int(time.time()),
        "exp": int(time.time()) + (30 * 24 * 3600), # 30 días
    }
    data_str = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(AUTH_SECRET.encode(), data_str.encode(), hashlib.sha256).hexdigest()
    return f"{data_str}.{sig}"

def verify_token(token: str) -> Optional[Dict]:
    """Verifica la firma del token y retorna el payload o None."""
    if not token or "." not in token:
        return None
    try:
        parts = token.strip().split(".")
        if len(parts) != 2:
            return None
        data_str, sig = parts
        expected_sig = hmac.new(AUTH_SECRET.encode(), data_str.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        # Padding
        padded = data_str + "=" * ((4 - len(data_str) % 4) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        if payload.get("exp") and payload["exp"] < int(time.time()):
            return None
        return payload
    except Exception:
        return None

def get_user_by_id(user_id: int) -> Optional[Dict]:
    if use_supabase():
        row = sb_get_one("users", {"id": user_id})
        if row:
            role = row.get("role") or ("admin" if row.get("username") == "admin" else "user")
            return {"id": row["id"], "username": row["username"], "name": row.get("name", ""), "role": role}
        return None
    else:
        with get_db() as conn:
            c = conn.cursor()
            c.execute("SELECT id, username, name, role FROM users WHERE id=?", (user_id,))
            row = c.fetchone()
            if not row:
                return None
            return {"id": row["id"], "username": row["username"], "name": row["name"], "role": row.get("role", "user")}

def register(username: str, password: str, name: str, role: str = "user") -> Optional[Dict]:
    username = username.strip().lower()
    # Solo se permite 'admin' si es el usuario admin por defecto o explicitamente establecido
    if username == "admin":
        role = "admin"
    elif role not in ("admin", "user"):
        role = "user"

    if use_supabase():
        existing = sb_get_one("users", {"username": username})
        if existing:
            return None
        try:
            row = sb_insert("users", {
                "username": username,
                "password_hash": _hash(password),
                "name": name.strip(),
                "role": role,
            })
        except Exception:
            # En caso de que la columna 'role' todavía no esté en supabase
            row = sb_insert("users", {
                "username": username,
                "password_hash": _hash(password),
                "name": name.strip(),
            })
        user = {"id": row["id"], "username": username, "name": name, "role": row.get("role", role)}
        token = generate_token(user)
        return {"token": token, "user": user}
    else:
        with get_db() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM users WHERE username=?", (username,))
            if c.fetchone():
                return None
            c.execute(
                "INSERT INTO users (username, password_hash, name, role) VALUES (?,?,?,?)",
                (username, _hash(password), name.strip(), role),
            )
            uid = c.lastrowid
            user = {"id": uid, "username": username, "name": name, "role": role}
            token = generate_token(user)
            return {"token": token, "user": user}

def login(username: str, password: str) -> Optional[Dict]:
    username = username.strip().lower()
    pw_hash = _hash(password)
    if use_supabase():
        row = sb_get_one("users", {"username": username, "password_hash": pw_hash})
        if not row:
            return None
        role = row.get("role") or ("admin" if username == "admin" else "user")
        user = {"id": row["id"], "username": username, "name": row.get("name", ""), "role": role}
        token = generate_token(user)
        return {"token": token, "user": user}
    else:
        with get_db() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id, username, name, role FROM users WHERE username=? AND password_hash=?",
                (username, pw_hash),
            )
            row = c.fetchone()
            if not row:
                return None
            role = row["role"] if ("role" in row and row["role"]) else ("admin" if username == "admin" else "user")
            user = {"id": row["id"], "username": row["username"], "name": row["name"], "role": role}
            token = generate_token(user)
            return {"token": token, "user": user}


def seed_user_defaults(user_id: int):
    """Crea las categorías y áreas iniciales para un nuevo usuario."""
    default_categories = [
        {"user_id": user_id, "name": "tarea",        "color": "#3b82f6", "description": "Acción concreta a realizar"},
        {"user_id": user_id, "name": "proyecto",     "color": "#8b5cf6", "description": "Conjunto de tareas relacionadas"},
        {"user_id": user_id, "name": "idea",         "color": "#f59e0b", "description": "Pensamiento o iniciativa futura"},
        {"user_id": user_id, "name": "nota",         "color": "#06b6d4", "description": "Información de referencia"},
        {"user_id": user_id, "name": "recordatorio", "color": "#10b981", "description": "Fecha o evento a no olvidar"},
        {"user_id": user_id, "name": "área",         "color": "#ec4899", "description": "Responsabilidad o rol principal"},
    ]
    default_areas = [
        {"user_id": user_id, "name": "Facultad",          "color": "#8b5cf6", "icon": "fa-graduation-cap", "description": "Materias y exámenes"},
        {"user_id": user_id, "name": "Emprendimiento 3D", "color": "#ec4899", "icon": "fa-cube",           "description": "Pedidos e impresiones 3D"},
        {"user_id": user_id, "name": "Finanzas",          "color": "#10b981", "icon": "fa-wallet",         "description": "Gastos e ingresos"},
        {"user_id": user_id, "name": "Personal",          "color": "#3b82f6", "icon": "fa-user",           "description": "Tareas personales"},
        {"user_id": user_id, "name": "Trabajo",           "color": "#f59e0b", "icon": "fa-briefcase",      "description": "Responsabilidades laborales"},
    ]
    if use_supabase():
        try:
            for cat in default_categories:
                try: sb_insert("categories", cat)
                except Exception: pass
            for area in default_areas:
                try: sb_insert("areas", area)
                except Exception: pass
        except Exception:
            pass
    else:
        with get_db() as conn:
            for cat in default_categories:
                try:
                    conn.execute("INSERT OR IGNORE INTO categories (user_id,name,color,description) VALUES (?,?,?,?)",
                                 (cat["user_id"], cat["name"], cat["color"], cat["description"]))
                except Exception: pass
            for area in default_areas:
                try:
                    conn.execute("INSERT OR IGNORE INTO areas (user_id,name,color,icon,description) VALUES (?,?,?,?,?)",
                                 (area["user_id"], area["name"], area["color"], area["icon"], area["description"]))
                except Exception: pass
            conn.commit()


def sync_oauth_user(access_token: str) -> Optional[Dict]:
    """Valida el access_token de Supabase Auth, sincroniza el usuario con la tabla users y devuelve token de sesión."""
    if not use_supabase():
        return None
    try:
        from database import get_sb
        sb = get_sb()
        sb_user_res = sb.auth.get_user(access_token)
        if not sb_user_res or not sb_user_res.user:
            return None
        sb_user = sb_user_res.user
        email = sb_user.email or ""
        metadata = sb_user.user_metadata or {}
        name = metadata.get("full_name") or metadata.get("name") or email.split("@")[0] or "Usuario Google"
        username = email.lower().strip() if email else f"google_{sb_user.id[:8]}"

        # Buscar usuario existente en tabla users
        existing = sb_get_one("users", {"username": username})
        if existing:
            role = existing.get("role") or ("admin" if username == "admin" else "user")
            user = {
                "id": existing["id"],
                "username": existing["username"],
                "name": existing.get("name") or name,
                "role": role,
            }
            token = generate_token(user)
            return {"token": token, "user": user}

        # Si no existe, crear usuario
        role = "admin" if username == "admin" else "user"
        try:
            row = sb_insert("users", {
                "username": username,
                "password_hash": _hash(f"oauth_{sb_user.id}"),
                "name": name,
                "role": role,
            })
        except Exception:
            row = sb_insert("users", {
                "username": username,
                "password_hash": _hash(f"oauth_{sb_user.id}"),
                "name": name,
            })

        uid = row["id"]
        seed_user_defaults(uid)

        user = {"id": uid, "username": username, "name": name, "role": row.get("role", role)}
        token = generate_token(user)
        return {"token": token, "user": user}
    except Exception as e:
        print(f"[Auth Error] sync_oauth_user error: {e}")
        return None


