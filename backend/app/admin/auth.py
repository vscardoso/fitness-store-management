"""
Autenticação do painel administrativo SQLAdmin.
Apenas usuários com role ADMIN podem acessar.
"""
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.core.security import verify_password, create_access_token, decode_token
from app.core.database import async_session_maker
from app.models.user import User, UserRole
from sqlalchemy import select


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = form.get("username")
        password = form.get("password")

        if not email or not password:
            return False

        async with async_session_maker() as db:
            result = await db.execute(
                select(User).where(User.email == email, User.is_active == True)
            )
            user = result.scalar_one_or_none()

        if not user:
            return False
        if not verify_password(password, user.hashed_password):
            return False
        if user.role != UserRole.ADMIN:
            return False

        token = create_access_token({"sub": str(user.id), "role": user.role})
        request.session.update({"admin_token": token})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        token = request.session.get("admin_token")
        if not token:
            return False
        payload = decode_token(token)
        if not payload:
            return False
        return payload.get("role") == UserRole.ADMIN
