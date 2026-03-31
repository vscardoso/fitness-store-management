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
