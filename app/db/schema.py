"""
Database Schema Module
Contains the latest, complete table definitions for a fresh install.
All tables are created with their final column set — no migration patches needed.
"""


def create_all(cursor):
    """Create all tables with the latest schema. Safe to call multiple times (IF NOT EXISTS)."""

    # --- Version Tracking ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS schema_version (
            key TEXT PRIMARY KEY DEFAULT 'version',
            version TEXT NOT NULL
        )
    ''')

    # --- Transcriptions ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            ai_summary TEXT,
            user_prompt TEXT,
            segment_start REAL DEFAULT 0,
            segment_end REAL,
            llm_model TEXT,
            asr_model TEXT,
            is_subtitle BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'completed',
            ai_status TEXT,
            is_pinned BOOLEAN DEFAULT 0
        )
    ''')

    # --- AI Summaries ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transcription_id INTEGER NOT NULL,
            prompt TEXT NOT NULL,
            summary TEXT NOT NULL,
            model TEXT,
            response_time REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            parent_id INTEGER,
            input_text TEXT,
            FOREIGN KEY (transcription_id) REFERENCES transcriptions (id) ON DELETE CASCADE
        )
    ''')

    # --- LLM Providers ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS llm_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 0
        )
    ''')

    # --- LLM Models ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS llm_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_id INTEGER NOT NULL,
            model_name TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 0,
            FOREIGN KEY (provider_id) REFERENCES llm_providers (id) ON DELETE CASCADE
        )
    ''')

    # --- ASR Models ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS asr_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            engine TEXT NOT NULL,
            config TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 0
        )
    ''')

    # --- Prompt Categories ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS prompt_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            key TEXT UNIQUE,
            sort_order INTEGER DEFAULT 0
        )
    ''')

    # --- Prompts ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            category_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            use_count INTEGER DEFAULT 0,
            FOREIGN KEY (category_id) REFERENCES prompt_categories (id) ON DELETE SET NULL
        )
    ''')

    # --- System Configs ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_configs (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    # --- Video Metadata ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_meta (
            source_id TEXT PRIMARY KEY,
            video_title TEXT,
            video_cover TEXT,
            source_type TEXT DEFAULT NULL,
            stream_url TEXT,
            stream_expired BOOLEAN DEFAULT 0,
            cache_expires_at DATETIME,
            cache_policy TEXT DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            original_source TEXT,
            status TEXT DEFAULT NULL,
            is_archived BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # --- Media Cache Entries ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media_cache_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            quality TEXT NOT NULL,
            media_path TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source_id, quality)
        )
    ''')

    # --- Tags ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#6366f1',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_tags (
            source_id TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source_id, tag_id),
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    ''')
