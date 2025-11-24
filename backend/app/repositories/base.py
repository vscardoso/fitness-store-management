"""
Base repository class with generic CRUD operations using SQLAlchemy 2.0 async.
"""

from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel

from app.models.base import BaseModel as DatabaseModel

# Generic type for the model
ModelType = TypeVar("ModelType", bound=DatabaseModel)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """
    Base repository class with generic CRUD operations.
    
    Provides common database operations for all models using async SQLAlchemy.
    """
    
    def __init__(self, model: Type[ModelType]):
        """
        Initialize repository with model class.
        
        Args:
            model: SQLAlchemy model class
        """
        self.model = model
    
    async def get(
        self, 
        db: AsyncSession, 
        id: int,
        *,
        tenant_id: int | None = None,
    ) -> Optional[ModelType]:
        """
        Get a single record by ID.
        
        Args:
            db: Database session
            id: Record ID
            
        Returns:
            Model instance or None if not found
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            stmt = select(self.model).where(
                self.model.id == id,
                self.model.is_active == True
            )
            if tenant_id is not None and hasattr(self.model, "tenant_id"):
                stmt = stmt.where(self.model.tenant_id == tenant_id)
            result = await db.execute(stmt)
            return result.scalar_one_or_none()
        except SQLAlchemyError as e:
            raise SQLAlchemyError(f"Error getting {self.model.__name__} with id {id}: {str(e)}")
    
    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 100,
        filters: Optional[Dict[str, Any]] = None,
        order_by: Optional[str] = None,
        tenant_id: int | None = None,
    ) -> List[ModelType]:
        """
        Get multiple records with pagination and filters.
        
        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return
            filters: Additional filters to apply
            order_by: Column to order by (default: id)
            
        Returns:
            List of model instances
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            stmt = select(self.model).where(self.model.is_active == True)
            if tenant_id is not None and hasattr(self.model, "tenant_id"):
                stmt = stmt.where(self.model.tenant_id == tenant_id)
            
            # Apply additional filters
            if filters:
                for field, value in filters.items():
                    if hasattr(self.model, field):
                        stmt = stmt.where(getattr(self.model, field) == value)
            
            # Apply ordering
            if order_by and hasattr(self.model, order_by):
                stmt = stmt.order_by(getattr(self.model, order_by))
            else:
                stmt = stmt.order_by(self.model.id)
            
            # Apply pagination
            stmt = stmt.offset(skip).limit(limit)
            
            result = await db.execute(stmt)
            return result.scalars().all()
        except SQLAlchemyError as e:
            raise SQLAlchemyError(f"Error getting multiple {self.model.__name__}: {str(e)}")
    
    async def create(
        self, 
        db: AsyncSession, 
        obj_in: Union[CreateSchemaType, Dict[str, Any]],
        *,
        tenant_id: int | None = None,
    ) -> ModelType:
        """
        Create a new record.
        
        Args:
            db: Database session
            obj_in: Data for creating the record (Pydantic model or dict)
            
        Returns:
            Created model instance
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            # Convert Pydantic model to dict if necessary
            if isinstance(obj_in, BaseModel):
                obj_data = obj_in.model_dump(exclude_unset=True)
            else:
                obj_data = obj_in
            
            # Inject tenant_id if provided and not already set
            if tenant_id is not None and hasattr(self.model, "tenant_id") and "tenant_id" not in obj_data:
                obj_data["tenant_id"] = tenant_id

            # Create model instance
            db_obj = self.model(**obj_data)
            
            # Add to session and flush to get ID
            db.add(db_obj)
            await db.flush()
            await db.refresh(db_obj)
            
            return db_obj
        except SQLAlchemyError as e:
            await db.rollback()
            raise SQLAlchemyError(f"Error creating {self.model.__name__}: {str(e)}")
    
    async def update(
        self,
        db: AsyncSession,
        *,
        id: int,
        obj_in: Union[UpdateSchemaType, Dict[str, Any]],
        tenant_id: int | None = None,
    ) -> Optional[ModelType]:
        """
        Update an existing record.
        
        Args:
            db: Database session
            id: Record ID to update
            obj_in: Data for updating the record (Pydantic model or dict)
            
        Returns:
            Updated model instance or None if not found
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            # Get existing record
            db_obj = await self.get(db, id, tenant_id=tenant_id)
            if not db_obj:
                return None
            
            # Convert Pydantic model to dict if necessary
            if isinstance(obj_in, BaseModel):
                update_data = obj_in.model_dump(exclude_unset=True)
            else:
                update_data = obj_in
            
            # Update fields
            for field, value in update_data.items():
                if hasattr(db_obj, field):
                    setattr(db_obj, field, value)
            
            # Flush changes and refresh
            await db.flush()
            await db.refresh(db_obj)
            
            return db_obj
        except SQLAlchemyError as e:
            await db.rollback()
            raise SQLAlchemyError(f"Error updating {self.model.__name__} with id {id}: {str(e)}")
    
    async def delete(
        self, 
        db: AsyncSession, 
        *,
        id: int,
        soft_delete: bool = True,
        tenant_id: int | None = None,
    ) -> bool:
        """
        Delete a record (soft delete by default).
        
        Args:
            db: Database session
            id: Record ID to delete
            soft_delete: If True, sets is_active=False; if False, permanently deletes
            
        Returns:
            True if deleted successfully, False if not found
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            if soft_delete:
                # Soft delete: set is_active = False
                stmt = (
                    update(self.model)
                    .where(self.model.id == id, self.model.is_active == True)
                    .values(is_active=False)
                )
                if tenant_id is not None and hasattr(self.model, "tenant_id"):
                    stmt = stmt.where(self.model.tenant_id == tenant_id)
                result = await db.execute(stmt)
                await db.flush()
                return result.rowcount > 0
            else:
                # Hard delete: permanently remove from database
                stmt = delete(self.model).where(self.model.id == id)
                if tenant_id is not None and hasattr(self.model, "tenant_id"):
                    stmt = stmt.where(self.model.tenant_id == tenant_id)
                result = await db.execute(stmt)
                await db.flush()
                return result.rowcount > 0
        except SQLAlchemyError as e:
            await db.rollback()
            raise SQLAlchemyError(f"Error deleting {self.model.__name__} with id {id}: {str(e)}")
    
    async def get_by_field(
        self,
        db: AsyncSession,
        *,
        field: str,
        value: Any,
        tenant_id: int | None = None,
    ) -> Optional[ModelType]:
        """
        Get a single record by any field.
        
        Args:
            db: Database session
            field: Field name to search by
            value: Value to search for
            
        Returns:
            Model instance or None if not found
            
        Raises:
            SQLAlchemyError: Database operation error
            ValueError: Invalid field name
        """
        try:
            if not hasattr(self.model, field):
                raise ValueError(f"Field '{field}' does not exist in {self.model.__name__}")
            
            stmt = select(self.model).where(
                getattr(self.model, field) == value,
                self.model.is_active == True
            )
            if tenant_id is not None and hasattr(self.model, "tenant_id"):
                stmt = stmt.where(self.model.tenant_id == tenant_id)
            result = await db.execute(stmt)
            return result.scalar_one_or_none()
        except SQLAlchemyError as e:
            raise SQLAlchemyError(f"Error getting {self.model.__name__} by {field}={value}: {str(e)}")
    
    async def exists(
        self,
        db: AsyncSession,
        *,
        id: int,
        tenant_id: int | None = None,
    ) -> bool:
        """
        Check if a record exists by ID.
        
        Args:
            db: Database session
            id: Record ID to check
            
        Returns:
            True if record exists and is active, False otherwise
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            stmt = select(self.model.id).where(
                self.model.id == id,
                self.model.is_active == True
            )
            if tenant_id is not None and hasattr(self.model, "tenant_id"):
                stmt = stmt.where(self.model.tenant_id == tenant_id)
            result = await db.execute(stmt)
            return result.scalar_one_or_none() is not None
        except SQLAlchemyError as e:
            raise SQLAlchemyError(f"Error checking existence of {self.model.__name__} with id {id}: {str(e)}")
    
    async def count(
        self,
        db: AsyncSession,
        *,
        filters: Optional[Dict[str, Any]] = None,
        tenant_id: int | None = None,
    ) -> int:
        """
        Count records with optional filters.
        
        Args:
            db: Database session
            filters: Optional filters to apply
            
        Returns:
            Number of matching records
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            stmt = select(func.count(self.model.id)).where(self.model.is_active == True)
            if tenant_id is not None and hasattr(self.model, "tenant_id"):
                stmt = stmt.where(self.model.tenant_id == tenant_id)
            
            # Apply filters
            if filters:
                for field, value in filters.items():
                    if hasattr(self.model, field):
                        stmt = stmt.where(getattr(self.model, field) == value)
            
            result = await db.execute(stmt)
            return result.scalar() or 0
        except SQLAlchemyError as e:
            raise SQLAlchemyError(f"Error counting {self.model.__name__}: {str(e)}")
    
    async def bulk_create(
        self,
        db: AsyncSession,
        *,
        objects: List[Union[CreateSchemaType, Dict[str, Any]]],
        tenant_id: int | None = None,
    ) -> List[ModelType]:
        """
        Create multiple records in bulk.
        
        Args:
            db: Database session
            objects: List of objects to create
            
        Returns:
            List of created model instances
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            db_objects = []
            
            for obj_in in objects:
                # Convert Pydantic model to dict if necessary
                if isinstance(obj_in, BaseModel):
                    obj_data = obj_in.model_dump(exclude_unset=True)
                else:
                    obj_data = obj_in
                
                if tenant_id is not None and hasattr(self.model, "tenant_id") and "tenant_id" not in obj_data:
                    obj_data["tenant_id"] = tenant_id
                db_obj = self.model(**obj_data)
                db_objects.append(db_obj)
            
            # Add all objects to session
            db.add_all(db_objects)
            await db.flush()
            
            # Refresh all objects to get their IDs
            for db_obj in db_objects:
                await db.refresh(db_obj)
            
            return db_objects
        except SQLAlchemyError as e:
            await db.rollback()
            raise SQLAlchemyError(f"Error bulk creating {self.model.__name__}: {str(e)}")
    
    async def get_or_create(
        self,
        db: AsyncSession,
        *,
        defaults: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> tuple[ModelType, bool]:
        """
        Get an existing record or create a new one.
        
        Args:
            db: Database session
            defaults: Default values for creation
            **kwargs: Fields to search by and default values
            
        Returns:
            Tuple of (model_instance, created_flag)
            
        Raises:
            SQLAlchemyError: Database operation error
        """
        try:
            # Try to get existing record
            stmt = select(self.model).where(self.model.is_active == True)
            tenant_id = kwargs.pop("tenant_id", None) if "tenant_id" in kwargs else None
            if tenant_id is not None and hasattr(self.model, "tenant_id"):
                stmt = stmt.where(self.model.tenant_id == tenant_id)
            
            for field, value in kwargs.items():
                if hasattr(self.model, field):
                    stmt = stmt.where(getattr(self.model, field) == value)
            
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                return existing, False
            
            # Create new record
            create_data = kwargs.copy()
            if defaults:
                create_data.update(defaults)
            
            new_obj = await self.create(db, obj_in=create_data, tenant_id=tenant_id)
            return new_obj, True
        except SQLAlchemyError as e:
            await db.rollback()
            raise SQLAlchemyError(f"Error in get_or_create for {self.model.__name__}: {str(e)}")