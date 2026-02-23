
import re
import hashlib
from urllib.parse import urlparse

def infer_source_type(source_id: str) -> str:
    """
    Infer the source type from a normalized source_id or raw string.
    
    Returns:
        'bilibili', 'youtube', 'douyin', 'network', 'file', or 'unknown'
    """
    if not source_id:
        return 'unknown'
        
    s = source_id.strip()
    
    # Bilibili
    if s.startswith("BV") or "bilibili.com" in s or "b23.tv" in s:
        return 'bilibili'
        
    # Douyin (prefix or domain)
    if s.startswith("dy_") or "douyin.com" in s:
        return 'douyin'
        
    # Network (prefix)
    if s.startswith("net_"):
        return 'network'
        
    # File (prefix)
    if s.startswith("file_"):
        return 'file'
        
    # YouTube (domain, short domain, or ID format)
    if "youtube.com" in s or "youtu.be" in s:
        return 'youtube'
    if re.match(r"^[a-zA-Z0-9_-]{11}$", s):
        return 'youtube'
        
    # Fallback for paths
    if re.match(r"^[A-Z]:", s) or s.startswith("/") or "\\" in s:
        return 'file'
        
    return 'network'

def normalize_source_id(raw_source: str, source_type: str = 'auto') -> str:
    """
    Normalize a raw source string (URL, path, ID) into a safe, short ID.
    
    Args:
        raw_source: The input source string (e.g. "https://b23.tv/...", "C:\\Users\\...", "BV1xx...")
        source_type: 'bilibili', 'youtube', 'douyin', 'network', 'file', or 'auto'
    
    Returns:
        A normalized source_id string (e.g. "BV1xx...", "dy_12345", "file_abc123")
    """
    if not raw_source:
        return ""
        
    raw_source = raw_source.strip()
    
    # 0. Check for existing normalized prefixes (Idempotency)
    # Bilibili is special because it starts with BV, handled below.
    if raw_source.startswith("dy_") or raw_source.startswith("net_") or raw_source.startswith("file_"):
        return raw_source
    
    # 1. Bilibili (BV ID)
    # Check if raw_source contains a BVID pattern
    bv_match = re.search(r"(BV[a-zA-Z0-9]{10})", raw_source)
    if bv_match:
        bvid = bv_match.group(1)
        
        # Check for ALREADY existing _p suffix (idempotency for internal IDs)
        if f"{bvid}_p" in raw_source:
             # Extract existing suffix
             p_exist = re.search(r"(_p\d+)", raw_source)
             if p_exist:
                 return f"{bvid}{p_exist.group(1)}"

        # Check for ?p=N parameter (from URL)
        p_match = re.search(r"[?&]p=(\d+)", raw_source)
        if p_match:
            p_val = int(p_match.group(1))
            if p_val > 1:
                return f"{bvid}_p{p_val}"
        return bvid
            
    # 2. YouTube (Video ID)
    if "youtube.com" in raw_source or "youtu.be" in raw_source:
        if "v=" in raw_source:
             parts = raw_source.split("v=")[1].split("&")[0]
             return parts
        if "youtu.be/" in raw_source:
             parts = raw_source.split("youtu.be/")[1].split("?")[0]
             return parts
            
    # YouTube Standalone ID (11 chars)
    if re.match(r"^[a-zA-Z0-9_-]{11}$", raw_source):
        return raw_source

    # 3. Douyin (Aweme ID)
    # Try to extract numeric ID from URL path: /video/7458617091420114236
    douyin_match = re.search(r"/video/(\d{19})", raw_source)
    if douyin_match:
        return f"dy_{douyin_match.group(1)}"
        
    # If input is just the numeric ID (19 digits)
    if re.match(r"^\d{19}$", raw_source):
         return f"dy_{raw_source}"

    # 4. Fallback Hashing for everything else
    # Use MD5 short hash (8 chars)
    hash_digest = hashlib.md5(raw_source.encode('utf-8')).hexdigest()[:8]
    
    # Infer type for fallback if auto
    inferred_type = source_type
    if inferred_type == 'auto':
        inferred_type = infer_source_type(raw_source)
    
    if inferred_type == 'douyin':
        return f"dy_{hash_digest}" 
    elif inferred_type == 'file' or raw_source.startswith("C:") or raw_source.startswith("/") or "\\" in raw_source:
        return f"file_{hash_digest}"
    else:
         # Default to 'net' for generic URLs
         return f"net_{hash_digest}"


def reconstruct_url(source_id: str, original_source: str = None) -> str:
    """
    Reconstruct a usable URL for the frontend based on the source_id.
    Prioritizes original_source if available.
    """
    if original_source:
        return original_source
        
    if source_id.startswith("BV"):
        base_id = source_id
        p_suffix = ""
        if "_p" in source_id:
            parts = source_id.split("_p")
            base_id = parts[0]
            p_suffix = f"?p={parts[1]}"
        return f"https://www.bilibili.com/video/{base_id}{p_suffix}"
    
    if not source_id.startswith("http") and not "_" in source_id and len(source_id) == 11:
         # Likely YouTube
         return f"https://www.youtube.com/watch?v={source_id}"
         
    # For others (dy_, net_, file_), we can't reconstruct without original_source
    # Return the ID itself as a fallback or empty string
    return ""

def resolve_bilibili_bvid(url_or_bvid: str) -> str | None:
    """
    Extract BV ID from URL, b23.tv short link, or raw BV ID string.
    """
    if not url_or_bvid:
        return None
        
    url_or_bvid = url_or_bvid.strip()
    
    # 1. Check for BV match directly
    bv_match = re.search(r'(BV[a-zA-Z0-9]{10})', url_or_bvid)
    if bv_match:
        return bv_match.group(1)
        
    # 2. Check for b23.tv short link
    if "b23.tv" in url_or_bvid:
        try:
            import requests
            # Resolve short URL
            resp = requests.head(url_or_bvid, allow_redirects=True, timeout=5)
            # Check resolved URL
            bv_match = re.search(r'(BV[a-zA-Z0-9]{10})', resp.url)
            if bv_match:
                return bv_match.group(1)
        except Exception:
            pass
            
    return None

def resolve_douyin_url(url: str) -> str:
    """
    Resolve a Douyin short link (v.douyin.com/xxx) to the full URL (douyin.com/video/xxx).
    Returns the resolved URL, or the original URL if resolution fails.
    """
    if not url:
        return url
    
    url = url.strip()
    
    # Only resolve v.douyin.com short links
    if "v.douyin.com" not in url:
        return url
    
    try:
        import requests
        resp = requests.head(
            url, 
            allow_redirects=True, 
            timeout=5,
            headers={
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
        )
        if resp.url and "douyin.com" in resp.url:
            return resp.url
    except Exception:
        pass
    
    return url


def resolve_youtube_video_id(url: str) -> str | None:
    """
    Extract YouTube video ID from URL.
    """
    if not url:
        return None
        
    if "v=" in url:
        try:
            return url.split("v=")[1].split("&")[0]
        except IndexError:
            return None
    elif "youtu.be/" in url:
        try:
            return url.split("youtu.be/")[1].split("?")[0]
        except IndexError:
            return None
            
    return None
