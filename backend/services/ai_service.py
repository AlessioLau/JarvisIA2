"""ai_service.py — Motor determinista offline para JarvisIA2
Extrae items estructurados a partir de texto libre, usando reglas en SQLite.
Fechas siempre en formato DD/MM/AAAA.
"""
from __future__ import annotations
import re
from datetime import datetime
from database import get_db, use_supabase, sb_select
from schemas import ExtractedItem


DATE_PATTERNS = [
    r'\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b',   # dd/mm/yyyy o dd-mm-yyyy
    r'\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b',    # dd/mm/yy
]

RELATIVE_DATES = {
    "hoy":      0,
    "mañana":   1,
    "pasado":   2,
    "lunes":    None,
    "martes":   None,
    "miércoles":None,
    "jueves":   None,
    "viernes":  None,
    "sábado":   None,
    "domingo":  None,
}

PRIORITY_KEYWORDS = {
    "alta":  ["urgente","asap","hoy","ya","inmediato","crítico"],
    "baja":  ["con tiempo","después","cuando pueda","algún día","más adelante"],
    "media": [],
}


def _today_str() -> str:
    return datetime.now().strftime("%d/%m/%Y")


def _extract_dates(text: str) -> list[str]:
    dates = []
    for pat in DATE_PATTERNS:
        for m in re.finditer(pat, text):
            groups = m.groups()
            if len(groups) == 3:
                d, mo, y = groups
                if len(y) == 2:
                    y = "20" + y
                dates.append(f"{int(d):02d}/{int(mo):02d}/{y}")
    return dates


def _split_sentences(text: str) -> list[str]:
    """Divide el texto en frases candidatas."""
    raw = re.split(r'[.\n;]|(?<!\d),(?!\d)', text)
    return [s.strip() for s in raw if len(s.strip()) > 6]


def _load_rules(user_id: int) -> list[dict]:
    if use_supabase():
        all_rules = sb_select("rules", {})
        return [r for r in all_rules if r.get("user_id") in (user_id, 1)]
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT keyword, target_type, target_value FROM rules WHERE user_id=? OR user_id=1", (user_id,))
        return [dict(r) for r in c.fetchall()]


def _apply_rules(sentence: str, rules: list[dict]) -> tuple[str | None, str | None, str]:
    """Devuelve (area, category, priority) según reglas."""
    low = sentence.lower()
    area = None
    category = None
    priority = "media"

    for rule in rules:
        kw = rule["keyword"].lower()
        if kw in low:
            t = rule["target_type"]
            v = rule["target_value"]
            if t == "area" and area is None:
                area = v
            elif t == "category" and category is None:
                category = v
            elif t == "priority":
                priority = v

    # Fallback priority from keywords
    for prio, kws in PRIORITY_KEYWORDS.items():
        for kw in kws:
            if kw in low:
                priority = prio
                break

    return area, category, priority


def process(text: str, user_id: int = 1) -> list[ExtractedItem]:
    rules = _load_rules(user_id)
    sentences = _split_sentences(text)
    global_dates = _extract_dates(text)
    items: list[ExtractedItem] = []

    current_date = None

    for sent in sentences:
        s = sent.strip()

        # Extraer fechas presentes en este fragmento
        local_dates = _extract_dates(s)
        if local_dates:
            current_date = local_dates[0]

        # Limpiar el título
        # 1. Quitar cadenas de fecha dd/mm/yyyy o dd/mm/yy
        title = re.sub(r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', '', s)
        # 2. Quitar viñetas, 'x.', 'x ', guiones o números al inicio
        title = re.sub(r'^[\s\*\-\d\.\,x]+', '', title, flags=re.IGNORECASE)
        # 3. Quitar 'x', 'x.', puntos sobrantes al final
        title = re.sub(r'[\s\.\,x]+$', '', title, flags=re.IGNORECASE)
        # 4. Quitar verbos auxiliares al inicio
        title = re.sub(r'^(tengo que|tengo|debo|hay que|necesito|quiero)\s+', '', title.strip(), flags=re.IGNORECASE)
        title = title.strip()

        # Si el título resultante es muy corto o no tiene palabras reales (ej: sólo era una fecha), descartar
        if len(re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]', '', title)) < 3:
            continue

        title = title[0].upper() + title[1:]

        area, category, priority = _apply_rules(s, rules)
        due_date = (local_dates or ([current_date] if current_date else None) or global_dates or [None])[0]

        is_ambiguous = category is None and area is None

        items.append(ExtractedItem(
            title=title,
            category=category or "tarea",
            priority=priority,
            area=area,
            due_date=due_date,
            is_ambiguous=is_ambiguous,
        ))

    return items
