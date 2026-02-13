"""User schemas for request/response validation."""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, validator

from app.models.user import UserRole


class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    full_name: str = Field(..., min_length=3, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)


class UserCreate(UserBase):
    """Schema for creating a user."""
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.SELLER
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, min_length=3, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    role: Optional[UserRole] = None


class UserResponse(UserBase):
    """Schema for user response."""
    id: int
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    tenant_id: Optional[int] = None
    store_name: Optional[str] = None  # Nome da loja do usuário
    
    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserPasswordChange(BaseModel):
    """Schema for changing password."""
    current_password: str
    new_password: str = Field(..., min_length=8)
    
    @validator('new_password')
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v


class Token(BaseModel):
    """Schema for token (simple)."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenResponse(BaseModel):
    """Schema for token response (with user data)."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ========== SCHEMAS PARA GERENCIAMENTO DE EQUIPE ==========

class TeamMemberCreate(BaseModel):
    """Schema para criar um membro da equipe (usuário na mesma loja)."""
    email: EmailStr
    full_name: str = Field(..., min_length=3, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.SELLER

    @validator('password')
    def validate_password(cls, v):
        """Validação simplificada para senhas de novos membros."""
        if len(v) < 6:
            raise ValueError('Senha deve ter pelo menos 6 caracteres')
        return v


class TeamMemberUpdate(BaseModel):
    """Schema para atualizar um membro da equipe."""
    full_name: Optional[str] = Field(None, min_length=3, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    role: Optional[UserRole] = None


class TeamMemberResponse(BaseModel):
    """Schema de resposta para membro da equipe."""
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TeamMemberListResponse(BaseModel):
    """Schema de resposta para lista de membros da equipe."""
    items: list[TeamMemberResponse]
    total: int


class ChangeRoleRequest(BaseModel):
    """Schema para mudar role de um usuário."""
    role: UserRole


class ResetPasswordRequest(BaseModel):
    """Schema para reset de senha por admin."""
    new_password: str = Field(..., min_length=6)

    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Senha deve ter pelo menos 6 caracteres')
        return v
