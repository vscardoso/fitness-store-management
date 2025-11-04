"""
Simple script to create admin user.
"""
import asyncio
import sys
import os

# Add the project root to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine
from app.models.user import User, UserRole
from app.core.security import get_password_hash

async def create_admin():
    """Create admin user."""
    print("Creating admin user...")

    async with AsyncSession(engine) as db:
        # Create admin user
        admin = User(
            email="admin@fitness.com",
            hashed_password=get_password_hash("admin123"),
            full_name="Administrator",
            role=UserRole.ADMIN,
            phone="(11) 99999-9999"
        )

        db.add(admin)
        await db.commit()

    print("Admin user created successfully!")
    print("Email: admin@fitness.com")
    print("Password: admin123")

if __name__ == "__main__":
    asyncio.run(create_admin())