import os
import shutil
import uuid
from typing import Optional
from fastapi import UploadFile

from app.core.config import settings
from app.core.logger import logger

class StorageService:
    @staticmethod
    def save_upload_file(file: UploadFile, filename: Optional[str] = None) -> str:
        """
        Save an uploaded file to the temporary uploads directory.
        Returns the absolute file path.
        """
        if not filename:
            ext = os.path.splitext(file.filename)[1]
            filename = f"{uuid.uuid4()}{ext}"
            
        file_path = os.path.join(settings.TEMP_UPLOADS_DIR, filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            logger.info(f"💾 File saved: {file_path}")
            return file_path
        except Exception as e:
            logger.error(f"❌ Failed to save upload file: {e}")
            raise e

    @staticmethod
    def get_temp_download_path(filename: str) -> str:
        """
        Generate a path in the temp downloads directory.
        Does not create the file, just returns the path.
        """
        return os.path.join(settings.TEMP_DOWNLOADS_DIR, filename)

    @staticmethod
    def get_temp_upload_path(filename: str) -> str:
        """
        Generate a path in the temp uploads directory.
        """
        return os.path.join(settings.TEMP_UPLOADS_DIR, filename)

    @staticmethod
    def save_cover_image(content: bytes, filename: str) -> Optional[str]:
        """
        Save binary content as a cover image.
        Returns the absolute file path or None on failure.
        """
        file_path = os.path.join(settings.COVERS_DIR, filename)
        try:
            with open(file_path, "wb") as f:
                f.write(content)
            logger.info(f"🖼️ Cover saved: {file_path}")
            return file_path
        except Exception as e:
            logger.error(f"❌ Failed to save cover image: {e}")
            return None

    @staticmethod
    def cleanup_file(path: str):
        """
        Safely remove a file if it exists.
        """
        if path and os.path.exists(path):
            try:
                os.remove(path)
                logger.debug(f"🗑️ Cleaned up file: {path}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to cleanup file {path}: {e}")

storage = StorageService()
