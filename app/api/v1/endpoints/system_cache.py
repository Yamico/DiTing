"""
System Cache Management Router
"""
import os
import hashlib
import urllib.parse
import sqlite3

from fastapi import APIRouter, Body, HTTPException
from starlette.concurrency import run_in_threadpool

from app.services.media_cache import MediaCacheService
from app.db import get_system_config, set_system_config, upsert_video_meta
from app.core.logger import logger
from app.core.config import settings
from app.api.v1.endpoints.covers import download_and_cache_cover

router = APIRouter(tags=["System Cache"])

# --- Cache Management ---

def cleanup_cover_cache(dry_run: bool = False, target_filenames: list = None):
    """
    Garbage Collect: Delete images in data/covers/ that are not referenced in the database.
    Args:
        dry_run: If True, return candidates without deleting.
        target_filenames: Optional list of filenames to delete (selective GC).
    Returns: (deleted_count, freed_bytes, candidates_list)
    """
    logger.info(f"🧹 Starting Cover Cache Cleanup (Dry Run: {dry_run})...")
    
    valid_hashes = set()
    conn = sqlite3.connect(settings.DB_PATH)
    c = conn.cursor()
    c.execute("SELECT DISTINCT video_cover FROM video_meta WHERE video_cover IS NOT NULL AND video_cover != ''")
    rows = c.fetchall()
    conn.close()
    
    for row in rows:
        url = row[0]
        if not url:
            continue
        
        # 1. New Local Covers: /api/covers/{filename}
        if url.startswith("/api/covers/"):
            filename = url.replace("/api/covers/", "")
            if filename:
                valid_hashes.add(filename)
            continue
        
        # 2. Legacy Logic for External URLs
        if url.startswith("//"):
            url = "https:" + url
        
        if not url.startswith("http"):
            continue
            
        # Strip query params
        parsed = urllib.parse.urlparse(url)
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        ext = ".jpg"
        if ".png" in clean_url.lower():
            ext = ".png"
        elif ".webp" in clean_url.lower():
            ext = ".webp"
        
        # Support BOTH old (full url) and new (clean url) hashes during transition
        h_old = hashlib.md5(url.encode('utf-8')).hexdigest() + ext
        valid_hashes.add(h_old)
        
        h_new = hashlib.md5(clean_url.encode('utf-8')).hexdigest() + ext
        valid_hashes.add(h_new)
        
    deleted_count = 0
    freed_bytes = 0
    candidates = []
    
    if os.path.exists(settings.COVERS_DIR):
        for filename in os.listdir(settings.COVERS_DIR):
            if filename == ".gitkeep":
                continue
            
            file_path = os.path.join(settings.COVERS_DIR, filename)
            if not os.path.isfile(file_path):
                continue
            
            if filename not in valid_hashes:
                # If target_filenames is provided, skip if not in list
                if target_filenames and filename not in target_filenames:
                    continue

                try:
                    size = os.path.getsize(file_path)
                    candidates.append({
                        "filename": filename,
                        "size": size,
                        "path": file_path
                    })
                    
                    if not dry_run:
                        os.remove(file_path)
                        deleted_count += 1
                        freed_bytes += size
                        logger.debug(f"🗑️ Deleted orphan: {filename}")
                except Exception as e:
                    logger.error(f"❌ Failed to process {filename}: {e}")
    
    if dry_run:
        logger.info(f"🔍 Dry Run Complete: Found {len(candidates)} orphans ({sum(c['size'] for c in candidates)/1024/1024:.2f} MB)")
        return 0, 0, candidates
        
    logger.info(f"✅ Cache Cleanup Complete: Deleted {deleted_count} files ({freed_bytes/1024/1024:.2f} MB)")
    return deleted_count, freed_bytes, candidates


@router.post("/clean_cache")
async def clean_cache_endpoint(payload: dict = None):
    """
    Trigger cache garbage collection
    Payload: { "target_filenames": ["hash1.jpg", ...] } (Optional)
    """
    target_filenames = payload.get("target_filenames") if payload else None
    
    count, bytes_freed, _ = await run_in_threadpool(cleanup_cover_cache, False, target_filenames)
    return {
        "status": "success", 
        "deleted_count": count, 
        "freed_mb": round(bytes_freed / (1024 * 1024), 2)
    }


@router.get("/covers/gc-candidates")
async def get_cover_gc_candidates():
    """Get list of orphan cover images that can be deleted"""
    _, _, candidates = await run_in_threadpool(cleanup_cover_cache, True)
    
    # Sort by size desc
    candidates.sort(key=lambda x: x['size'], reverse=True)
    
    return {
        "count": len(candidates),
        "total_size_bytes": sum(c['size'] for c in candidates),
        "items": candidates
    }


@router.post("/covers/migrate")
async def migrate_covers(dry_run: bool = False):
    """
    Migrate existing HTTP cover URLs to local storage.
    """
    logger.info(f"🚀 Starting Cover Migration (Dry Run: {dry_run})...")
    
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    # Find all http/https covers
    c.execute("SELECT source_id, video_cover, video_title FROM video_meta WHERE video_cover LIKE 'http%' OR video_cover LIKE '//%'")
    rows = c.fetchall()
    conn.close()
    
    total = len(rows)
    migrated = 0
    failed = 0
    skipped = 0
    
    results = []
    
    for row in rows:
        source_id = row['source_id']
        url = row['video_cover']
        
        if not url:
            continue
            
        if dry_run:
            results.append({"source_id": source_id, "url": url, "status": "candidate"})
            continue
            
        try:
            # Download and cache
            local_path = await run_in_threadpool(download_and_cache_cover, url)
            
            if local_path and local_path != url:
                # Update DB
                # CAUTION: We use upsert_video_meta but we must be careful not to overwrite other fields if they changed?
                # Actually upsert updates provided fields.
                # However, upsert_video_meta signature: source_id is required. video_title is optional.
                
                # To minimize side effects, we should update ONLY video_cover directly via SQL?
                # upsert_video_meta updates updated_at too.
                # Let's use upsert_video_meta to be safe and consistent.
                
                # Wait, upsert_video_meta requires video_title if it inserts. But here we update.
                # If we pass video_title=None, it might ignore it or set to None?
                # Let's check upsert_video_meta implementation.
                # It does: `INSERT INTO ... ON CONFLICT DO UPDATE SET ...`
                # If we pass arguments, they are updated.
                
                upsert_video_meta(
                    source_id=source_id,
                    video_cover=local_path
                )
                migrated += 1
                results.append({"source_id": source_id, "status": "migrated", "new_path": local_path})
            else:
                failed += 1
                results.append({"source_id": source_id, "status": "failed", "url": url})
                
        except Exception as e:
            failed += 1
            logger.error(f"Migration failed for {source_id}: {e}")
            results.append({"source_id": source_id, "status": "error", "error": str(e)})
            
    logger.info(f"🏁 Migration Complete: {migrated}/{total} migrated, {failed} failed.")
    
    return {
        "status": "success",
        "dry_run": dry_run,
        "total": total,
        "migrated": migrated,
        "failed": failed,
        "details": results
    }


@router.get("/media_retention")
async def get_media_retention_policy():
    """Get current media retention policy."""
    policy, days = MediaCacheService.get_retention_policy()
    
    # New configs
    cron_interval = float(get_system_config("media_retention_cron_interval", "1"))
    capacity_gb = float(get_system_config("media_cache_capacity_gb", "0"))
    
    return {
        "policy": policy, 
        "days": days,
        "cron_interval": cron_interval,
        "capacity_gb": capacity_gb
    }

@router.put("/media_retention")
async def update_media_retention_policy(data: dict = Body(...)):
    """Update media retention policy."""
    policy = data.get("policy")
    days = data.get("days", 0)
    cron_interval = data.get("cron_interval")
    capacity_gb = data.get("capacity_gb")
    
    if policy not in ["delete_after_asr", "always_keep", "keep_days"]:
        raise HTTPException(status_code=400, detail="Invalid policy")
        
    value = policy
    if policy == "keep_days":
        value = f"keep_days:{days}"
        
    set_system_config("media_retention_policy", value)
    
    if cron_interval is not None:
        try:
            val = float(cron_interval)
            if val <= 0: val = 1
            set_system_config("media_retention_cron_interval", str(val))
        except (ValueError, TypeError):
            pass
            
    if capacity_gb is not None:
        try:
            val = float(capacity_gb)
            if val < 0: val = 0
            set_system_config("media_cache_capacity_gb", str(val))
        except (ValueError, TypeError):
            pass

    return {"status": "success"}

@router.get("/media_stats")
async def get_media_stats():
    """Get media cache statistics."""
    return MediaCacheService.get_stats()


@router.get("/media_gc/candidates")
async def get_media_gc_candidates():
    """Get list of files that would be deleted by GC."""
    candidates = await run_in_threadpool(MediaCacheService.get_gc_candidates)
    return {
        "count": len(candidates),
        "total_size_bytes": sum(c['filesize'] for c in candidates),
        "items": candidates
    }

@router.get("/media_gc/expiring")
def get_expiring_media(days: int = 1):
    """
    Get list of media files expiring within the next N days.
    """
    try:
        candidates = MediaCacheService.get_expiring_soon(days=days)
        return {"candidates": candidates}
    except Exception as e:
        logger.error(f"Error getting expiring media: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/media_gc")
async def trigger_media_gc(body: dict = Body(default={})):
    """
    Trigger media cache garbage collection.
    Body: { "target_source_ids": ["source1", "source2"] } (Optional)
    """
    target_ids = body.get("target_source_ids")
    count, bytes_freed = await run_in_threadpool(MediaCacheService.run_gc, target_ids)
    return {
        "status": "success",
        "deleted_count": count,
        "freed_mb": round(bytes_freed / (1024 * 1024), 2)
    }


# --- Management Center Cache Endpoints (v9+) ---

@router.get("/cache/entries")
async def get_cache_entries_endpoint():
    """Get all cache entries with video info for Management Center."""
    from app.db.media_cache_entries import get_all_cache_entries
    from datetime import datetime, timedelta
    
    entries = await run_in_threadpool(get_all_cache_entries)
    
    # Get global policy
    policy, keep_days = MediaCacheService.get_retention_policy()
    
    result = []
    for e in entries:
        entry_dict = dict(e)
        
        # Calculate Expiration
        expires_at = None
        cache_policy = entry_dict.get("cache_policy")
        custom_expires_at = entry_dict.get("cache_expires_at")
        cached_at_str = entry_dict.get("cached_at")
        
        if cache_policy == 'keep_forever':
            expires_at = None
        elif cache_policy == 'custom' and custom_expires_at:
             expires_at = custom_expires_at
        elif policy == 'keep_days' and keep_days > 0 and cached_at_str:
            try:
                # Handle "YYYY-MM-DD HH:MM:SS" format from DB
                dt_str = str(cached_at_str)
                if 'T' not in dt_str:
                    dt_str = dt_str.replace(' ', 'T')
                
                cached_dt = datetime.fromisoformat(dt_str)
                expiration_dt = cached_dt + timedelta(days=keep_days)
                expires_at = expiration_dt.isoformat()
            except Exception as e:
                # logger.warning(f"Failed to calculate expiration for {cached_at_str}: {e}")
                pass

        result.append({
            "id": entry_dict.get("id"),
            "source_id": entry_dict.get("source_id"),
            "quality": entry_dict.get("quality"),
            "media_path": entry_dict.get("media_path"),
            "file_size": entry_dict.get("file_size", 0),
            "cached_at": entry_dict.get("cached_at"),
            "video_title": entry_dict.get("video_title"),
            "video_cover": entry_dict.get("video_cover"),
            "expires_at": expires_at
        })
    
    return {"entries": result, "total": len(result)}


@router.delete("/cache/entries")
async def delete_cache_entry_endpoint(source_id: str, quality: str):
    """Delete a specific cache entry by source_id + quality."""
    from app.db.media_cache_entries import get_cache_entry
    entry = get_cache_entry(source_id, quality)
    
    if not entry:
        raise HTTPException(status_code=404, detail="Cache entry not found")
    
    # Delete file
    rel_path = entry['media_path']
    full_path = os.path.join(os.getcwd(), rel_path)
    freed = 0
    if os.path.exists(full_path):
        freed = os.path.getsize(full_path)
        os.remove(full_path)
    
    # Delete DB record
    from app.db.media_cache_entries import delete_cache_entry
    delete_cache_entry(source_id, quality)
    
    return {"status": "success", "freed_bytes": freed}


@router.get("/cache/integrity")
async def get_cache_integrity():
    """Get cache integrity report (scan only)."""
    return await run_in_threadpool(MediaCacheService.scan_integrity)


@router.post("/cache/cleanup")
async def cleanup_cache_integrity(payload: dict = Body(...)):
    """
    Cleanup cache integrity issues.
    Payload:
    {
        "type": "fs_orphans" | "db_orphans",
        "targets": ["filename1", ...] or [id1, ...]
    }
    """
    cleanup_type = payload.get("type")
    targets = payload.get("targets")
    
    if cleanup_type == "fs_orphans":
        count, freed = await run_in_threadpool(MediaCacheService.delete_fs_orphans, targets)
        return {"status": "success", "deleted_count": count, "freed_bytes": freed}
    elif cleanup_type == "db_orphans":
        count = await run_in_threadpool(MediaCacheService.delete_db_orphans, targets)
        return {"status": "success", "deleted_count": count}
    else:
        raise HTTPException(status_code=400, detail="Invalid cleanup type")


@router.post("/cache/sync")
async def sync_cache_integrity(delete_orphans: bool = False):
    """Bidirectional sync between DB records and filesystem. Optionally delete orphan files."""
    result = await run_in_threadpool(MediaCacheService.sync_integrity, delete_orphans)
    return result


