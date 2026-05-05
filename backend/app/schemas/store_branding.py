"""Schemas para branding da loja."""
from pydantic import BaseModel, Field
from typing import Optional


class StoreBrandingResponse(BaseModel):
    name: str
    tagline: Optional[str] = None
    primary_color: str
    secondary_color: str
    accent_color: str
    logo_url: Optional[str] = None

    model_config = {"from_attributes": True}


class StoreBrandingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    tagline: Optional[str] = Field(None, max_length=255)
    primary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class LogoUploadResponse(BaseModel):
    logo_url: str


class StorePIXKeyUpdate(BaseModel):
    pix_key: Optional[str] = Field(None, max_length=255, description="Chave PIX: CPF, CNPJ, email, telefone (+55...) ou chave aleatória")
    pix_key_type: Optional[str] = Field(None, description="Tipo: cpf, cnpj, email, phone, random")
    pix_provider: Optional[str] = Field(None, description="Provider: generic, cielo_pix, mercadopago, mock")


class StorePIXKeyResponse(BaseModel):
    pix_key: Optional[str] = None
    pix_key_type: Optional[str] = None
    has_pix_key: bool = False
    pix_provider: str = "mock"

    model_config = {"from_attributes": True}
