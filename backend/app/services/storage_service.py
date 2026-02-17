"""
Storage Service - Abstração para upload de arquivos.

Implementação atual: Local (filesystem)
Fácil trocar para: S3, Cloudinary, Firebase Storage

Para escalar:
1. Criar nova classe (S3StorageService, CloudinaryStorageService)
2. Implementar mesma interface (upload, delete, get_url)
3. Trocar no get_storage_service()
"""

import os
import uuid
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO
from fastapi import UploadFile
from app.core.config import settings


class BaseStorageService(ABC):
    """Interface abstrata para serviços de storage."""

    @abstractmethod
    async def upload(self, file: UploadFile, folder: str, filename: str | None = None) -> str:
        """
        Upload de arquivo.

        Args:
            file: Arquivo para upload
            folder: Pasta/prefixo (ex: 'products', 'users')
            filename: Nome do arquivo (opcional, gera UUID se não informado)

        Returns:
            URL ou path do arquivo salvo
        """
        pass

    @abstractmethod
    async def delete(self, file_path: str) -> bool:
        """
        Deleta arquivo.

        Args:
            file_path: Caminho ou URL do arquivo

        Returns:
            True se deletou, False se não encontrou
        """
        pass

    @abstractmethod
    def get_url(self, file_path: str) -> str:
        """
        Retorna URL pública do arquivo.

        Args:
            file_path: Caminho relativo do arquivo

        Returns:
            URL completa para acessar o arquivo
        """
        pass


class LocalStorageService(BaseStorageService):
    """
    Implementação local de storage.

    Salva arquivos em: backend/uploads/{folder}/{filename}
    Serve via: GET /uploads/{folder}/{filename}
    """

    def __init__(self):
        self.base_path = Path(settings.UPLOAD_DIR)
        self.base_url = settings.UPLOAD_URL

        # Criar diretório base se não existir
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def upload(self, file: UploadFile, folder: str, filename: str | None = None) -> str:
        """Upload local de arquivo."""

        # Criar pasta do folder se não existir
        folder_path = self.base_path / folder
        folder_path.mkdir(parents=True, exist_ok=True)

        # Gerar nome único se não informado
        if not filename:
            ext = self._get_extension(file.filename or "image.jpg")
            filename = f"{uuid.uuid4().hex}{ext}"

        # Caminho completo
        file_path = folder_path / filename

        # Salvar arquivo
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Retornar caminho relativo
        return f"{folder}/{filename}"

    async def upload_from_bytes(self, data: bytes, folder: str, filename: str | None = None, ext: str = ".jpg") -> str:
        """Upload de bytes diretamente (útil para base64)."""

        # Criar pasta do folder se não existir
        folder_path = self.base_path / folder
        folder_path.mkdir(parents=True, exist_ok=True)

        # Gerar nome único se não informado
        if not filename:
            filename = f"{uuid.uuid4().hex}{ext}"

        # Caminho completo
        file_path = folder_path / filename

        # Salvar arquivo
        with open(file_path, "wb") as buffer:
            buffer.write(data)

        # Retornar caminho relativo
        return f"{folder}/{filename}"

    async def delete(self, file_path: str) -> bool:
        """Deleta arquivo local."""
        full_path = self.base_path / file_path

        if full_path.exists():
            full_path.unlink()
            return True

        return False

    def get_url(self, file_path: str) -> str:
        """Retorna URL para acessar o arquivo."""
        return f"{self.base_url}/{file_path}"

    def get_full_path(self, file_path: str) -> Path:
        """Retorna caminho completo do arquivo."""
        return self.base_path / file_path

    def _get_extension(self, filename: str) -> str:
        """Extrai extensão do arquivo."""
        if "." in filename:
            return "." + filename.rsplit(".", 1)[1].lower()
        return ".jpg"


class CloudinaryStorageService(BaseStorageService):
    """
    Implementação Cloudinary para produção.

    Vantagens:
    - CDN global (imagens carregam rápido)
    - Transformações automáticas (resize, webp, crop)
    - Free tier: 25GB storage + 25GB bandwidth/mês
    - Persistente (não perde em deploys)
    """

    def __init__(self):
        import cloudinary
        import cloudinary.uploader

        # Configurar Cloudinary
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True
        )

        self.cloudinary = cloudinary
        self.uploader = cloudinary.uploader

    async def upload(self, file: UploadFile, folder: str, filename: str | None = None) -> str:
        """Upload de arquivo para Cloudinary."""
        import cloudinary.uploader

        # Ler conteúdo do arquivo
        content = await file.read()

        # Gerar public_id único
        if filename:
            public_id = f"{folder}/{filename.rsplit('.', 1)[0]}"
        else:
            public_id = f"{folder}/{uuid.uuid4().hex}"

        # Upload para Cloudinary
        result = cloudinary.uploader.upload(
            content,
            public_id=public_id,
            folder=None,  # Já incluído no public_id
            overwrite=True,
            resource_type="image",
            transformation=[
                {"quality": "auto:good"},
                {"fetch_format": "auto"}
            ]
        )

        # Retornar public_id (usamos para construir URL depois)
        return result["public_id"]

    async def upload_from_bytes(self, data: bytes, folder: str, filename: str | None = None, ext: str = ".jpg") -> str:
        """Upload de bytes para Cloudinary."""
        import cloudinary.uploader

        # Gerar public_id único
        if filename:
            public_id = f"{folder}/{filename.rsplit('.', 1)[0]}"
        else:
            public_id = f"{folder}/{uuid.uuid4().hex}"

        # Upload para Cloudinary
        result = cloudinary.uploader.upload(
            data,
            public_id=public_id,
            folder=None,
            overwrite=True,
            resource_type="image",
            transformation=[
                {"quality": "auto:good"},
                {"fetch_format": "auto"}
            ]
        )

        return result["public_id"]

    async def delete(self, file_path: str) -> bool:
        """Deleta arquivo do Cloudinary."""
        import cloudinary.uploader

        try:
            result = cloudinary.uploader.destroy(file_path)
            return result.get("result") == "ok"
        except Exception:
            return False

    def get_url(self, file_path: str) -> str:
        """
        Retorna URL otimizada do Cloudinary.

        Aplica transformações automáticas:
        - f_auto: formato otimizado (webp quando suportado)
        - q_auto: qualidade otimizada
        - w_800: largura máxima 800px (economiza banda)
        """
        import cloudinary

        # Gerar URL com transformações
        url = cloudinary.CloudinaryImage(file_path).build_url(
            transformation=[
                {"width": 800, "crop": "limit"},
                {"quality": "auto:good"},
                {"fetch_format": "auto"}
            ]
        )

        return url


def get_storage_service() -> BaseStorageService:
    """
    Factory para obter serviço de storage.

    - DEV (local): Salva em /uploads (rápido, sem custo)
    - PROD (Render): Usa Cloudinary (persistente, CDN global)

    Configurar STORAGE_TYPE no .env:
    - STORAGE_TYPE=local (desenvolvimento)
    - STORAGE_TYPE=cloudinary (produção)
    """
    if settings.STORAGE_TYPE == "cloudinary":
        # Verificar se credenciais estão configuradas
        if not settings.CLOUDINARY_CLOUD_NAME:
            raise ValueError(
                "STORAGE_TYPE=cloudinary mas CLOUDINARY_CLOUD_NAME não configurado. "
                "Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET."
            )
        return CloudinaryStorageService()

    return LocalStorageService()
