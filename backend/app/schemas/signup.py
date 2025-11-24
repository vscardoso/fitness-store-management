"""
Signup schemas for multi-tenant SaaS registration
"""
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, validator
from app.models.user import UserRole


class SignupRequest(BaseModel):
    """
    Schema para cadastro completo (usuário + loja + subscription)
    """
    # User data
    full_name: str = Field(..., min_length=3, max_length=200, description="Nome completo do usuário")
    email: EmailStr = Field(..., description="Email único do usuário")
    password: str = Field(..., min_length=8, description="Senha (mín. 8 caracteres)")
    phone: Optional[str] = Field(None, max_length=20, description="Telefone opcional")
    
    # Store data
    store_name: str = Field(..., min_length=3, max_length=255, description="Nome da loja/empresa")
    store_slug: Optional[str] = Field(None, max_length=100, description="Slug da loja (gerado se não informado)")
    
    # Address data (optional - for store location)
    zip_code: Optional[str] = Field(None, max_length=10, description="CEP da loja")
    street: Optional[str] = Field(None, max_length=255, description="Rua/Avenida")
    number: Optional[str] = Field(None, max_length=20, description="Número")
    complement: Optional[str] = Field(None, max_length=100, description="Complemento")
    neighborhood: Optional[str] = Field(None, max_length=100, description="Bairro")
    city: Optional[str] = Field(None, max_length=100, description="Cidade")
    state: Optional[str] = Field(None, max_length=2, description="UF do estado")
    
    # Subscription plan (opcional, default: trial)
    plan: Optional[str] = Field("trial", description="Plano inicial: trial, free, pro, enterprise")
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Senha deve ter pelo menos 8 caracteres')
        if not any(c.isupper() for c in v):
            raise ValueError('Senha deve conter pelo menos uma letra maiúscula')
        if not any(c.islower() for c in v):
            raise ValueError('Senha deve conter pelo menos uma letra minúscula')
        if not any(c.isdigit() for c in v):
            raise ValueError('Senha deve conter pelo menos um número')
        return v
    
    @validator('plan')
    def validate_plan(cls, v):
        """Validate plan type"""
        valid_plans = ['trial', 'free', 'pro', 'enterprise']
        if v not in valid_plans:
            raise ValueError(f'Plano inválido. Opções: {", ".join(valid_plans)}')
        return v
    
    @validator('store_slug')
    def validate_slug(cls, v):
        """Validate slug format (lowercase, no spaces, alphanumeric + hyphens)"""
        if v is None:
            return v
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('Slug deve conter apenas letras, números, hífens e underscores')
        if v != v.lower():
            raise ValueError('Slug deve estar em minúsculas')
        return v


class SignupResponse(BaseModel):
    """
    Response após signup bem-sucedido
    """
    user_id: int
    user_email: str
    user_name: str
    
    store_id: int
    store_name: str
    store_slug: str
    subdomain: Optional[str]
    
    subscription_id: int
    plan: str
    is_trial: bool
    trial_ends_at: Optional[str]  # ISO 8601 datetime string
    trial_days_remaining: int
    
    # Access tokens
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    
    message: str = "Cadastro realizado com sucesso! Bem-vindo(a)!"
    
    class Config:
        from_attributes = True


class CheckEmailRequest(BaseModel):
    """Schema para verificar disponibilidade de email"""
    email: EmailStr


class CheckEmailResponse(BaseModel):
    """Response da verificação de email"""
    available: bool
    message: str


class CheckSlugRequest(BaseModel):
    """Schema para verificar disponibilidade de slug"""
    slug: str = Field(..., min_length=3, max_length=100)


class CheckSlugResponse(BaseModel):
    """Response da verificação de slug"""
    available: bool
    suggested_slug: Optional[str] = None
    message: str
