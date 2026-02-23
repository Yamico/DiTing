import urllib.parse

def _format_cover_url(cover: str) -> str:
    """Format cover URL for frontend consumption"""
    if not cover:
        return ""
    # Legacy fallback: if somehow still an external URL, use proxy
    if cover.startswith("http") or cover.startswith("//"):
        return f"/api/covers/cache?url={urllib.parse.quote(cover)}"
    return cover
