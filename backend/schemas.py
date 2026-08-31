"""schemas.py — Modelos Pydantic para JarvisIA2 (v2 — formato real de Excel)"""
from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel


class UserRegister(BaseModel):
    username: str
    password: str
    name: str = ""

class UserLogin(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    name: str


class CategoryCreate(BaseModel):
    name: str
    color: str = "#3b82f6"
    description: str = ""

class CategoryOut(BaseModel):
    id: int
    user_id: int
    name: str
    color: str
    description: Optional[str] = None


class AreaCreate(BaseModel):
    name: str
    color: str = "#8b5cf6"
    icon: str = "fa-layer-group"
    description: str = ""

class AreaOut(BaseModel):
    id: int
    user_id: int
    name: str
    color: str
    icon: str
    description: Optional[str] = None


class RuleCreate(BaseModel):
    keyword: str
    target_type: str
    target_value: str

class RuleOut(BaseModel):
    id: int
    user_id: int
    keyword: str
    target_type: str
    target_value: str


class DumpCreate(BaseModel):
    text: str

class DumpOut(BaseModel):
    id: int
    user_id: int
    original_text: str
    status: str
    created_at: Optional[str] = None

class ProcessRequest(BaseModel):
    text: str
    dump_id: Optional[int] = None

class ExtractedItem(BaseModel):
    title: str
    category: str = "tarea"
    priority: str = "media"
    area: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    is_ambiguous: bool = False

class ProcessResponse(BaseModel):
    dump_id: Optional[int]
    original_text: str
    extracted_items: List[ExtractedItem]

class ApproveRequest(BaseModel):
    dump_id: Optional[int] = None
    items: List[ExtractedItem]

class ItemUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    area: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None

class ItemOut(BaseModel):
    id: int
    user_id: int
    dump_id: Optional[int]
    title: str
    category: str
    status: str
    priority: str
    area: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ── FACULTAD ───────────────────────────────────────────────
# Formato basado en Facu (1).xlsx:
# Nombre | Abreviatura | Cursado | Nivel | Cursada(Corr.) | Aprobada(Corr.) | Estado | Nota | TipoPromo

class FacuCreate(BaseModel):
    name: str
    abbreviation: Optional[str] = None
    cursado: str = "C"             # C=Cuatrimestral, A=Anual
    level: str = "I"               # I, II, III, IV, V
    correlativa_cursada: Optional[str] = None
    correlativa_aprobada: Optional[str] = None
    status: str = "Cursando"       # Cursando | Aprobada | Regular | NoCursada | Libre
    grade: Optional[float] = None
    condition_detail: Optional[str] = None  # Final | Promo | None

class FacuOut(FacuCreate):
    id: int
    user_id: int
    created_at: Optional[str] = None


# ── FINANZAS ────────────────────────────────────────────────
# Hoja Gastos:  Fecha Alta | Fecha Pago | Descripcion | Monto | Categoria | Medio de Pago | Observacion
# Hoja Ingresos: Fecha | Descripción | Monto | Categoria | Medio de Pago | Pagado a
# Hoja Inversiones: Fecha | Descripción | Plataforma | Precio de Compra Promedio | Cantidad | Valor actual

class FinanzaCreate(BaseModel):
    type: str              # gasto | ingreso
    fecha_alta: Optional[str] = None   # dd/mm/aaaa (solo gastos)
    fecha_pago: str                    # dd/mm/aaaa
    description: str
    amount: float
    category: str = "Varios"
    payment_method: str = "Efectivo"
    paid_to: Optional[str] = None     # solo ingresos
    notes: Optional[str] = None       # Observacion (gastos)

class FinanzaOut(FinanzaCreate):
    id: int
    user_id: int
    created_at: Optional[str] = None

class InversionCreate(BaseModel):
    fecha: Optional[str] = None
    description: str
    platform: Optional[str] = None
    buy_price: Optional[float] = None
    quantity: Optional[float] = None
    current_val: Optional[float] = None

class InversionOut(InversionCreate):
    id: int
    user_id: int
    created_at: Optional[str] = None


# ── PEDIDOS 3D ──────────────────────────────────────────────
# Formato basado en Pedidos3D.xlsx:
# Cliente | Vendedor | Producto | Fecha Pedido | Precio | Fecha Entrega | Tiempo | Gramos | Estado | Prioridad | Observacion

class PedidoCreate(BaseModel):
    client: str
    seller: Optional[str] = None
    product: str
    order_date: str
    delivery_date: Optional[str] = None
    price: Optional[float] = None
    time_str: Optional[str] = None       # texto libre ej: "Aprox 16 hs"
    grams_str: Optional[str] = None      # texto libre ej: "Aprox 120g"
    hours: Optional[float] = None
    status: str = "Diseño"
    priority: Optional[str] = "media"
    notes: Optional[str] = None

class PedidoOut(PedidoCreate):
    id: int
    user_id: int
    created_at: Optional[str] = None
