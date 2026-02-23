import os
import shutil
import time
from datetime import datetime, timedelta
from app.core.config import settings
from app.db.system_config import get_system_config
from app.db.connection import get_connection
from app.db.media_cache_entries import (
    get_cache_entries, get_cache_entry, upsert_cache_entry,
    delete_cache_entry, delete_all_cache_entries, get_best_cache_path,
    get_cache_stats, get_all_cache_entries,
)
from app.core.logger import logger

class MediaCacheService:
    @staticmethod
    def get_retention_policy():
        """
        Get the current retention policy from system config.
        Returns:
            tuple: (policy_name, days)
            policy_name: 'delete_after_asr' | 'always_keep' | 'keep_days'
            days: int (only for 'keep_days')
        """
        policy_str = get_system_config("media_retention_policy", "keep_days:3")
        
        if policy_str.startswith("keep_days:"):
            try:
                days = int(policy_str.split(":")[1])
                return "keep_days", days
            except (ValueError, TypeError):
                return "delete_after_asr", 0
        
        return policy_str, 0

    @staticmethod
    def should_keep():
        """Check if media should be kept based on current policy."""
        policy, _ = MediaCacheService.get_retention_policy()
        return policy != "delete_after_asr"

    @staticmethod
    def find_existing_cache(source: str, quality: str = None, mode: str = 'playback', return_quality: bool = False):
        """
        Check if there's already a valid cached file for this source.
        v9: Uses media_cache_entries table.
        
        Args:
            source: source_id
            quality: specific quality to look for, or None for best available
            mode: 'playback' or 'transcription' (affects priority if quality is None)
            return_quality: whether to return a tuple (path, quality)
            
        Returns: relative path if found and exists on disk, else None. 
                 If return_quality=True, returns (path, quality) or (None, None).
        """
        if not source:
            return (None, None) if return_quality else None
        
        if quality:
            entry = get_cache_entry(source, quality)
            if entry and entry['media_path']:
                full_path = os.path.join(os.getcwd(), entry['media_path'])
                if os.path.exists(full_path):
                    return (entry['media_path'], quality) if return_quality else entry['media_path']
        else:
            # Find best available using mode priority
            path, found_quality = get_best_cache_path(source, priority_mode=mode)
            if path:
                return (path, found_quality) if return_quality else path
        
        return (None, None) if return_quality else None

    @staticmethod
    def cache_file(temp_path: str, transcription_id: int, source: str = None, quality: str = 'best'):
        """
        Move a temporary file to the media cache directory.
        v9: Writes to media_cache_entries table instead of video_meta.
        
        Args:
            temp_path: Path to the temporary file
            transcription_id: Associated transcription ID
            source: source_id for hash-based naming
            quality: 'best' | 'worst' | 'audio_only'
            
        Returns the relative path to the cached file.
        """
        if not temp_path or not os.path.exists(temp_path):
            return None

        # Ensure cache directory exists
        os.makedirs(settings.MEDIA_CACHE_DIR, exist_ok=True)

        new_filename = None
        
        if source:
            import hashlib
            source_hash = hashlib.md5(source.encode("utf-8")).hexdigest()
            ext = os.path.splitext(temp_path)[1]
            # Include quality in filename for multi-version support
            # best -> hash.ext
            # others -> hash_quality.ext
            if quality and quality != 'best':
                new_filename = f"{source_hash}_{quality}{ext}"
            else:
                new_filename = f"{source_hash}{ext}"
        else:
            # Fallback to ID-based naming
            original_name = os.path.basename(temp_path)
            new_filename = f"{transcription_id}_{original_name}"
            
        target_path = os.path.join(settings.MEDIA_CACHE_DIR, new_filename)
        
        try:
            relative_path = os.path.join("data", "media_cache", new_filename).replace("\\", "/")
            
            # If target already exists and source-hash, assume same file
            if os.path.exists(target_path) and source:
                logger.info(f"🔄 Reusing existing cache for {source}: {relative_path}")
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            else:
                # Move file
                shutil.move(temp_path, target_path)
            
            # Calculate file size
            file_size = os.path.getsize(target_path) if os.path.exists(target_path) else 0
            
            # v9: Update media_cache_entries table
            source_id = source
            if not source_id and transcription_id:
                # Resolve source from transcription
                conn = get_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT source FROM transcriptions WHERE id = ?", (transcription_id,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    source_id = row[0]
            
            if source_id:
                upsert_cache_entry(source_id, quality, relative_path, file_size)
                # Also reset expired custom policy
                MediaCacheService._reset_expired_policy(source_id)
            
            logger.info(f"💾 Cached media [{quality}] for {source_id or transcription_id}: {relative_path}")
            return relative_path
        except Exception as e:
            logger.error(f"❌ Failed to cache media file: {e}")
            return None

    @staticmethod
    def _reset_expired_policy(source_id: str):
        """Reset expired custom cache policy for a source."""
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = datetime.now()
            
            cursor.execute("SELECT cache_policy, cache_expires_at FROM video_meta WHERE source_id = ?", (source_id,))
            meta = cursor.fetchone()
            
            if meta:
                policy, expires_at = meta
                if policy == 'custom' and expires_at:
                    expires_dt = expires_at
                    if isinstance(expires_at, str):
                        try:
                            expires_dt = datetime.fromisoformat(expires_at)
                        except ValueError:
                            pass
                            
                    if isinstance(expires_dt, datetime) and expires_dt < now:
                        logger.info(f"🔄 Resetting expired custom policy for {source_id}")
                        cursor.execute(
                            "UPDATE video_meta SET cache_policy = NULL, cache_expires_at = NULL WHERE source_id = ?",
                            (source_id,)
                        )
                        conn.commit()
        except Exception as e:
            logger.error(f"❌ Error resetting policy for {source_id}: {e}")
        finally:
            conn.close()

    @staticmethod
    def assign_cache(transcription_id: int, relative_path: str, quality: str):
        """Public method to link a source to an existing cached file."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT source FROM transcriptions WHERE id = ?", (transcription_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            file_size = 0
            full_path = os.path.join(os.getcwd(), relative_path)
            if os.path.exists(full_path):
                file_size = os.path.getsize(full_path)
            upsert_cache_entry(row[0], quality, relative_path, file_size)

    @staticmethod
    def cleanup_or_delete(temp_path: str, transcription_id: int, source: str = None, quality: str = 'best'):
        """
        Decide whether to cache or delete the file based on retention policy.
        This is the main entry point to replace finally: os.remove().
        """
        if not temp_path:
            return

        if not os.path.exists(temp_path):
            return

        if MediaCacheService.should_keep():
            MediaCacheService.cache_file(temp_path, transcription_id, source, quality)
        else:
            try:
                os.remove(temp_path)
                logger.debug(f"🗑️ Deleted temp file: {temp_path}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to delete temp file {temp_path}: {e}")

    @staticmethod
    def get_gc_candidates(dry_run: bool = True):
        """
        Identify files eligible for deletion based on retention policy.
        v9: Uses media_cache_entries table.
        Returns:
            list: List of dicts {source_id, quality, media_path, policy, reason, size, title}
        """
        policy, days = MediaCacheService.get_retention_policy()
        candidates = []
        
        conn = get_connection()
        cursor = conn.cursor()
        
        now = datetime.now()
        where_clauses = []
        params = []
        
        # A. Custom Policy Expiry
        where_clauses.append("(vm.cache_policy = 'custom' AND vm.cache_expires_at < ?)")
        params.append(now)
        
        # B. Global Policy Expiry
        if policy == "keep_days" and days > 0:
            cutoff_date = now - timedelta(days=days)
            where_clauses.append("(vm.cache_policy IS NULL AND e.cached_at < ?)")
            params.append(cutoff_date)
            
        elif policy == "delete_after_asr":
            cutoff_date = now - timedelta(hours=1)
            where_clauses.append("(vm.cache_policy IS NULL AND e.cached_at < ?)")
            params.append(cutoff_date)

        if where_clauses:
            full_where = " OR ".join(where_clauses)
            sql = f"""
                SELECT e.source_id, e.quality, e.media_path, e.file_size, e.cached_at,
                       vm.cache_policy, vm.video_title, vm.cache_expires_at
                FROM media_cache_entries e
                LEFT JOIN video_meta vm ON e.source_id = vm.source_id
                WHERE (vm.cache_policy IS NOT 'keep_forever' OR vm.cache_policy IS NULL)
                AND ({full_where})
            """
            
            cursor.execute(sql, tuple(params))
            expired_rows = cursor.fetchall()
            
            for row in expired_rows:
                source_id, quality, rel_path, file_size, cached_at, vm_policy, title, expires_at = row
                
                if vm_policy == 'keep_forever': 
                    continue
                    
                full_path = os.path.join(os.getcwd(), rel_path)
                size = file_size or 0
                if size == 0 and os.path.exists(full_path):
                    size = os.path.getsize(full_path)
                
                reason = "Global Policy Expiry"
                if vm_policy == 'custom':
                    reason = f"Custom Policy Expired ({expires_at})"
                elif policy == 'delete_after_asr':
                    reason = "Global Policy (Delete after ASR)"
                elif policy == 'keep_days':
                    reason = f"Global Policy (> {days} days)"

                candidates.append({
                    "source_id": source_id,
                    "quality": quality,
                    "media_path": rel_path,
                    "filesize": size,
                    "title": title or source_id,
                    "reason": reason,
                    "policy": vm_policy or "global"
                })
        
        conn.close()
        return candidates

    @staticmethod
    def get_expiring_soon(days: int = 1):
        """
        Identify files expiring within the next N days.
        v9: Uses media_cache_entries table.
        """
        policy, keep_days = MediaCacheService.get_retention_policy()
        candidates = []
        
        conn = get_connection()
        cursor = conn.cursor()
        
        now = datetime.now()
        future_limit = now + timedelta(days=days)
        
        where_clauses = []
        params = []
        
        # A. Custom Policy
        where_clauses.append("(vm.cache_policy = 'custom' AND vm.cache_expires_at > ? AND vm.cache_expires_at < ?)")
        params.extend([now, future_limit])
        
        # B. Global Policy
        if policy == "keep_days" and keep_days > 0:
            min_cached_at = now - timedelta(days=keep_days)
            max_cached_at = future_limit - timedelta(days=keep_days)
            
            where_clauses.append("(vm.cache_policy IS NULL AND e.cached_at > ? AND e.cached_at < ?)")
            params.extend([min_cached_at, max_cached_at])
            
        if where_clauses:
            full_where = " OR ".join(where_clauses)
            sql = f"""
                SELECT e.source_id, e.quality, e.media_path, e.file_size, e.cached_at,
                       vm.cache_policy, vm.video_title, vm.cache_expires_at
                FROM media_cache_entries e
                LEFT JOIN video_meta vm ON e.source_id = vm.source_id
                WHERE ({full_where})
                ORDER BY vm.cache_expires_at ASC, e.cached_at ASC
            """
            
            cursor.execute(sql, tuple(params))
            rows = cursor.fetchall()
            
            for row in rows:
                source_id, quality, rel_path, file_size, cached_at, vm_policy, title, expires_at = row
                
                full_path = os.path.join(os.getcwd(), rel_path)
                size = file_size or 0
                if size == 0 and os.path.exists(full_path):
                    size = os.path.getsize(full_path)
                
                expiry_dt = None
                reason = ""
                
                if vm_policy == 'custom':
                    expiry_dt = expires_at if isinstance(expires_at, datetime) else datetime.fromisoformat(expires_at)
                    reason = "Custom Policy"
                else:
                    expiry_dt = cached_at + timedelta(days=keep_days)
                    reason = f"Global Policy ({keep_days} days)"
                
                if expiry_dt > now:
                    candidates.append({
                        "source_id": source_id,
                        "quality": quality,
                        "media_path": rel_path,
                        "filesize": size,
                        "title": title or source_id,
                        "reason": reason,
                        "expires_at": expiry_dt.isoformat(),
                        "time_left_hours": round((expiry_dt - now).total_seconds() / 3600, 1)
                    })
        
        conn.close()
        return candidates

    @staticmethod
    def run_gc(target_source_ids: list[str] = None):
        """
        Run Garbage Collection.
        v9: Uses media_cache_entries table.
        
        Args:
            target_source_ids: Optional list of source_ids to delete.
            
        Returns:
            tuple: (deleted_count, freed_bytes)
        """
        deleted_count = 0
        freed_bytes = 0
        
        # 1. Expired Candidates
        candidates = MediaCacheService.get_gc_candidates(dry_run=False)
        
        for item in candidates:
            source_id = item['source_id']
            quality = item.get('quality', 'best')
            
            if target_source_ids is not None:
                if source_id not in target_source_ids:
                    continue

            rel_path = item['media_path']
            full_path = os.path.join(os.getcwd(), rel_path)
            
            # v9: Delete from media_cache_entries
            delete_cache_entry(source_id, quality)
            
            # Delete file
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                    freed_bytes += item['filesize']
                    deleted_count += 1
                    logger.info(f"🗑️ GC deleted expired media: {rel_path} ({item['reason']})")
                except Exception as e:
                    logger.error(f"❌ GC failed to delete {full_path}: {e}")

        # 2. Orphaned files (only during full GC)
        if target_source_ids is None:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT media_path FROM media_cache_entries")
            valid_paths = {os.path.normpath(row[0]) for row in cursor.fetchall()}
            conn.close()

            if os.path.exists(settings.MEDIA_CACHE_DIR):
                for filename in os.listdir(settings.MEDIA_CACHE_DIR):
                    full_path = os.path.join(settings.MEDIA_CACHE_DIR, filename)
                    rel_path = os.path.join("data", "media_cache", filename)
                    
                    if os.path.normpath(rel_path) not in valid_paths:
                        try:
                            if os.path.isfile(full_path):
                                size = os.path.getsize(full_path)
                                os.remove(full_path)
                                freed_bytes += size
                                deleted_count += 1
                                logger.info(f"🧹 GC removed orphaned file: {filename}")
                        except Exception as e:
                            logger.error(f"❌ GC failed to delete orphan {filename}: {e}")

        # 3. Capacity Limit Enforcement (only during full GC)
        if target_source_ids is None:
            # Check for capacity limit
            try:
                capacity_msg = get_system_config("media_cache_capacity_gb", "0")
                capacity_gb = float(capacity_msg)
            except (ValueError, TypeError):
                capacity_gb = 0.0
            
            if capacity_gb > 0:
                stats = MediaCacheService.get_stats()
                current_size = stats.get('total_size_bytes', 0)
                limit_bytes = int(capacity_gb * 1024 * 1024 * 1024)
                
                if current_size > limit_bytes:
                    bytes_to_free = current_size - limit_bytes
                    # Simple formatting helper inline
                    def fmt(b): 
                        return f"{b / (1024**3):.2f} GB"

                    logger.info(f"💾 Cache over capacity ({fmt(current_size)} > {capacity_gb}GB). Need to free {fmt(bytes_to_free)}.")
                    
                    conn = get_connection()
                    cursor = conn.cursor()
                    
                    # Find oldest cache entries (excluding 'keep_forever' policy)
                    # We prioritize deleting 'delete_after_asr' even if not expired (unlikely if loop 1 works),
                    # then 'temp' or anything that is simply old.
                    # We exclude 'keep_forever' items from eviction? Usually capacity limit overrides keep days but respects manual keep forever.
                    # Let's respect 'keep_forever'.
                    
                    sql = """
                        SELECT e.source_id, e.quality, e.media_path, e.file_size, e.cached_at
                        FROM media_cache_entries e
                        LEFT JOIN video_meta vm ON e.source_id = vm.source_id
                        WHERE (vm.cache_policy IS NOT 'keep_forever' OR vm.cache_policy IS NULL)
                        ORDER BY e.cached_at ASC
                    """
                    cursor.execute(sql)
                    all_candidates = cursor.fetchall()
                    conn.close()
                    
                    freed_in_capacity_check = 0
                    
                    for row in all_candidates:
                        if freed_in_capacity_check >= bytes_to_free:
                            break
                            
                        source_id, quality, rel_path, file_size, cached_at = row
                        
                        full_path = os.path.join(os.getcwd(), rel_path)
                        delete_cache_entry(source_id, quality)
                        
                        if os.path.exists(full_path):
                            try:
                                size = os.path.getsize(full_path)
                                os.remove(full_path)
                                freed_in_capacity_check += size
                                freed_bytes += size
                                deleted_count += 1
                                logger.info(f"🗑️ GC capacity cleanup: {rel_path} (Oldest: {cached_at})")
                            except Exception as e:
                                logger.error(f"❌ GC capacity failed to delete {full_path}: {e}")
                                
                    logger.info(f"💾 Capacity cleanup finished. Freed {fmt(freed_in_capacity_check)}.")

        return deleted_count, freed_bytes

    @staticmethod
    def delete_cache_for_video(source_id: str):
        """
        Manually delete all cached files for a specific video source.
        v9: Uses media_cache_entries table.
        """
        entries = get_cache_entries(source_id)
        deleted = False
        
        for entry in entries:
            rel_path = entry['media_path']
            full_path = os.path.join(os.getcwd(), rel_path)
            
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                    logger.info(f"🗑️ Deleted cache [{entry['quality']}] for {source_id}: {full_path}")
                    deleted = True
                except Exception as e:
                    logger.error(f"❌ Failed to delete cache {full_path}: {e}")
        
        # Remove all DB entries
        delete_all_cache_entries(source_id)
        return deleted

    next_gc_time = None

    @staticmethod
    def get_stats():
        """Get cache statistics. v9: Uses media_cache_entries for DB stats, filesystem for actual size."""
        db_stats = get_cache_stats()
        
        # Also scan filesystem for real totals (catches orphans)
        fs_count = 0
        fs_size = 0
        
        if os.path.exists(settings.MEDIA_CACHE_DIR):
            for f in os.listdir(settings.MEDIA_CACHE_DIR):
                fp = os.path.join(settings.MEDIA_CACHE_DIR, f)
                if os.path.isfile(fp):
                    fs_count += 1
                    fs_size += os.path.getsize(fp)
        
        return {
            "file_count": db_stats['total_count'],
            "total_size_bytes": db_stats['total_size'],
            "total_size_mb": round(db_stats['total_size'] / (1024 * 1024), 2) if db_stats['total_size'] else 0,
            "total_size_gb": round(db_stats['total_size'] / (1024 * 1024 * 1024), 2) if db_stats['total_size'] else 0,
            "by_quality": db_stats['by_quality'],
            "fs_file_count": fs_count,
            "fs_total_size_bytes": fs_size,
            "orphan_count": max(0, fs_count - db_stats['total_count']),
            "warning_threshold_gb": 1.0,
            "next_gc_time": MediaCacheService.next_gc_time.isoformat() if MediaCacheService.next_gc_time else None
        }

    @staticmethod
    def scan_integrity():
        """
        Scan for integrity issues.
        Returns:
            dict: {
                "db_orphans": [{"id", "source_id", "quality", "media_path", "full_path"}],
                "fs_orphans": [{"filename", "path", "size"}]
            }
        """
        db_orphans = []
        fs_orphans = []
        
        conn = get_connection()
        cursor = conn.cursor()
        
        # 1. DB Orphans (Entries → Missing File)
        cursor.execute("SELECT id, source_id, quality, media_path FROM media_cache_entries")
        all_entries = cursor.fetchall()
        
        valid_paths = set()
        
        for entry in all_entries:
            entry_id, source_id, quality, rel_path = entry
            full_path = os.path.join(os.getcwd(), rel_path)
            valid_paths.add(os.path.normpath(rel_path))
            
            if not os.path.exists(full_path):
                db_orphans.append({
                    "id": entry_id,
                    "source_id": source_id,
                    "quality": quality,
                    "media_path": rel_path,
                    "full_path": full_path
                })
        
        conn.close()
        
        # 2. FS Orphans (File → Missing Entry)
        if os.path.exists(settings.MEDIA_CACHE_DIR):
            for filename in os.listdir(settings.MEDIA_CACHE_DIR):
                full_path = os.path.join(settings.MEDIA_CACHE_DIR, filename)
                rel_path = os.path.join("data", "media_cache", filename)
                
                if os.path.isfile(full_path) and os.path.normpath(rel_path) not in valid_paths:
                    fs_orphans.append({
                        "filename": filename,
                        "path": full_path,
                        "size": os.path.getsize(full_path)
                    })
                    
        return {
            "db_orphans": db_orphans,
            "fs_orphans": fs_orphans
        }

    @staticmethod
    def delete_db_orphans(target_ids: list[int] = None):
        """
        Delete DB records that point to missing files.
        Args:
            target_ids: Optional list of IDs to delete. If None, delete all found.
        Returns: count
        """
        report = MediaCacheService.scan_integrity()
        candidates = report['db_orphans']
        
        count = 0
        conn = get_connection()
        cursor = conn.cursor()
        
        for item in candidates:
            if target_ids is not None and item['id'] not in target_ids:
                continue
                
            cursor.execute("DELETE FROM media_cache_entries WHERE id = ?", (item['id'],))
            count += 1
            
        conn.commit()
        conn.close()
        return count

    @staticmethod
    def delete_fs_orphans(target_filenames: list[str] = None):
        """
        Delete files that are not in DB.
        Args:
            target_filenames: Optional list of filenames. If None, delete all found.
        Returns: (count, freed_bytes)
        """
        report = MediaCacheService.scan_integrity()
        candidates = report['fs_orphans']
        
        count = 0
        freed = 0
        
        for item in candidates:
            if target_filenames is not None and item['filename'] not in target_filenames:
                continue
            
            try:
                if os.path.exists(item['path']):
                    os.remove(item['path'])
                    count += 1
                    freed += item['size']
            except Exception as e:
                logger.error(f"❌ Failed to delete orphan {item['path']}: {e}")
                
        return count, freed

    @staticmethod
    def sync_integrity(delete_orphans=False):
        """
        Legacy wrapper for full sync.
        Automatically cleans DB orphans. Optionally cleans FS orphans.
        """
        # 1. Clean all DB orphans
        db_cleaned = MediaCacheService.delete_db_orphans()
        
        # 2. Clean FS orphans if requested
        orphans_found = 0
        fs_cleaned_count = 0
        fs_cleaned_bytes = 0
        
        report = MediaCacheService.scan_integrity()
        orphans_found = len(report['fs_orphans'])
        
        details = []
        # Add DB actions to details (reconstructed for legacy response compatibility)
        # Scan already re-ran, so we don't have the exact IDs deleted unless we tracked them.
        # For legacy "sync", just reporting counts/summaries is usually enough or we can't easily reconstruction.
        # We'll just return summary/counts.
        
        if delete_orphans:
            fs_cleaned_count, fs_cleaned_bytes = MediaCacheService.delete_fs_orphans()
            
        # Construct summary details for UI toast
        if db_cleaned > 0:
            details.append({"action": f"Removed {db_cleaned} missing DB entries"})
        if fs_cleaned_count > 0:
            details.append({"action": f"Deleted {fs_cleaned_count} orphan files ({fs_cleaned_bytes} bytes)"})
        elif orphans_found > 0:
            details.append({"action": f"Found {orphans_found} orphan files (files not in DB)"})
            
        return {
            "db_cleaned": db_cleaned,
            "orphans_found": orphans_found,
            "fs_cleaned": fs_cleaned_count,
            "details": details
        }
