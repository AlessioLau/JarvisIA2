"""auth_service.py — Registro y Login de usuarios para JarvisIA2"""
from __future__ import annotations
import hashlib, secrets
from database import get_db, use_supabase, sb_get_one, sb_insert


_sessions: dict[str, dict] = {}


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def register(username: str, password: str, name: str) -> dict | None:
    if use_supabase():
        # Verificar si ya existe
        existing = sb_get_one("users", {"username": username})
        if existing:
            return None
        row = sb_insert("users", {
            "username": username,
            "password_hash": _hash(password),
            "name": name,
        })
        return {"id": row["id"], "username": username, "name": name}
    else:
        with get_db() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM users WHERE username=?", (username,))
            if c.fetchone():
                return None
            c.execute(
                "INSERT INTO users (username, password_hash, name) VALUES (?,?,?)",
                (username, _hash(password), name),
            )
            uid = c.lastrowid
            return {"id": uid, "username": username, "name": name}


def login(username: str, password: str) -> dict | None:
    if use_supabase():
        row = sb_get_one("users", {"username": username, "password_hash": _hash(password)})
        if not row:
            return None
        token = secrets.token_hex(32)
        user = {"id": row["id"], "username": username, "name": row.get("name", "")}
        _sessions[token] = user
        return {"token": token, "user": user}
    else:
        with get_db() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id, name FROM users WHERE username=? AND password_hash=?",
                (username, _hash(password)),
            )
            row = c.fetchone()
            if not row:
                return None
            token = secrets.token_hex(32)
            user = {"id": row["id"], "username": username, "name": row["name"]}
            _sessions[token] = user
            return {"token": token, "user": user}
