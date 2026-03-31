"""Serviço de autenticação de usuários e gerenciamento de sessões."""
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate

logger = logging.getLogger(__name__)

# Regras de sessao
ACCESS_TOKEN_MINUTES = 15       # access_token curto; renovado via refresh durante uso ativo
SESSION_MAX_HOURS = 0           # 0 desativa expiracao absoluta (expira por inatividade)
INACTIVITY_HOURS = 1            # inatividade: 1h sem usar o refresh_token


class AuthService:
    """Serviço para autenticação e gerenciamento de sessões."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)

    # ── Registro ──────────────────────────────────────────────────────────────

    async def register_user(self, user_data: UserCreate) -> User:
        existing_user = await self.user_repo.get_by_email(user_data.email)
        if existing_user:
            raise ValueError("Email já cadastrado")
        hashed_password = get_password_hash(user_data.password)
        user_dict = user_data.model_dump(exclude={'password'})
        user_dict['hashed_password'] = hashed_password
        return await self.user_repo.create(user_dict)

    # ── Autenticação ──────────────────────────────────────────────────────────

    async def authenticate(self, email: str, password: str) -> Optional[User]:
        user = await self.user_repo.get_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        if not user.is_active:
            return None
        return user

    # ── Tokens ────────────────────────────────────────────────────────────────

    def create_access_token_for_user(self, user: User) -> str:
        """Cria access_token JWT de curta duração (15 min)."""
        return create_access_token(
            data={
                "sub": str(user.id),
                "role": user.role.value,
                "tenant_id": user.tenant_id,
            },
            expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES),
        )

    async def create_token(self, user: User) -> str:
        """Compat: cria apenas access_token (usado em endpoints legados)."""
        return self.create_access_token_for_user(user)

    async def create_session(self, user: User) -> Tuple[str, str]:
        """
        Cria uma nova sessão: access_token + refresh_token rastreado no banco.

        Returns:
            (access_token, raw_refresh_token)
        """
        # Limpar tokens expirados do usuário (housekeeping)
        await self._cleanup_expired_tokens(user.id)

        # Gerar refresh token
        now = datetime.utcnow()
        raw_token = RefreshToken.generate_raw_token()
        token_hash = RefreshToken.hash_token(raw_token)

        refresh_token = RefreshToken(
            token_hash=token_hash,
            user_id=user.id,
            tenant_id=user.tenant_id,
            created_at=now,
            last_used_at=now,
            expires_at=now + timedelta(hours=SESSION_MAX_HOURS) if SESSION_MAX_HOURS > 0 else now + timedelta(days=3650),
            revoked=False,
        )
        self.db.add(refresh_token)
        await self.db.commit()

        access_token = self.create_access_token_for_user(user)
        return access_token, raw_token

    async def refresh_session(self, raw_refresh_token: str) -> Tuple[str, str, str]:
        """
        Valida refresh token e emite novos tokens (rotation).

        Returns:
            (new_access_token, new_refresh_token, error_reason)
            error_reason: "" = sucesso | "INACTIVITY" | "SESSION_EXPIRED" | "INVALID"
        """
        token_hash = RefreshToken.hash_token(raw_refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        token_record = result.scalar_one_or_none()

        if not token_record or token_record.revoked:
            return "", "", "INVALID"

        now = datetime.utcnow()

        # Checar sessao absoluta apenas se habilitada
        if SESSION_MAX_HOURS > 0 and now > token_record.expires_at:
            await self._revoke_token(token_record)
            return "", "", "SESSION_EXPIRED"

        # Checar inatividade (1h)
        inactivity_limit = token_record.last_used_at + timedelta(hours=INACTIVITY_HOURS)
        if now > inactivity_limit:
            await self._revoke_token(token_record)
            return "", "", "INACTIVITY"

        # Buscar usuário
        result = await self.db.execute(
            select(User).where(User.id == token_record.user_id, User.is_active == True)
        )
        user = result.scalar_one_or_none()
        if not user:
            await self._revoke_token(token_record)
            return "", "", "INVALID"

        # Token rotation: revogar atual, emitir novo
        token_record.revoked = True
        await self.db.flush()

        new_raw = RefreshToken.generate_raw_token()
        new_hash = RefreshToken.hash_token(new_raw)
        new_record = RefreshToken(
            token_hash=new_hash,
            user_id=user.id,
            tenant_id=user.tenant_id,
            created_at=token_record.created_at,  # mantém o created_at original (limite 24h)
            last_used_at=now,
            expires_at=token_record.expires_at,  # mantém o expires_at original
            revoked=False,
        )
        self.db.add(new_record)
        await self.db.commit()

        new_access = self.create_access_token_for_user(user)
        return new_access, new_raw, ""

    async def revoke_session(self, raw_refresh_token: str) -> None:
        """Revoga refresh token (logout explícito)."""
        token_hash = RefreshToken.hash_token(raw_refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        record = result.scalar_one_or_none()
        if record:
            await self._revoke_token(record)

    async def revoke_all_user_sessions(self, user_id: int) -> None:
        """Revoga todas as sessões do usuário (troca de senha, etc.)."""
        await self.db.execute(
            delete(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked == False,
            )
        )
        await self.db.commit()

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _revoke_token(self, token_record: RefreshToken) -> None:
        token_record.revoked = True
        await self.db.commit()

    async def _cleanup_expired_tokens(self, user_id: int) -> None:
        """Remove tokens expirados ou revogados do usuário (housekeeping silencioso)."""
        now = datetime.utcnow()
        await self.db.execute(
            delete(RefreshToken).where(
                RefreshToken.user_id == user_id,
                (RefreshToken.expires_at < now) | (RefreshToken.revoked == True),
            )
        )
        await self.db.commit()

    # ── Métodos legados ───────────────────────────────────────────────────────

    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        return await self.user_repo.get(self.db, user_id)

    async def change_password(self, user_id: int, current_password: str, new_password: str) -> bool:
        user = await self.user_repo.get(self.db, user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        if not verify_password(current_password, user.hashed_password):
            raise ValueError("Senha atual incorreta")
        await self.user_repo.update(self.db, user_id, {"hashed_password": get_password_hash(new_password)})
        # Revogar todas as sessões ao trocar senha
        await self.revoke_all_user_sessions(user_id)
        return True

    async def deactivate_user(self, user_id: int) -> bool:
        user = await self.user_repo.get(self.db, user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        await self.user_repo.update(self.db, id=user_id, obj_in={"is_active": False})
        await self.revoke_all_user_sessions(user_id)
        return True

    async def activate_user(self, user_id: int) -> bool:
        user = await self.user_repo.get(self.db, user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        await self.user_repo.update(self.db, id=user_id, obj_in={"is_active": True})
        return True
