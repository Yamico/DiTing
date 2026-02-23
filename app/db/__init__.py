"""
Database Package
Re-exports all functions for backward compatibility.
"""
# Connection helpers
from app.db.connection import get_connection, get_connection_with_row

# Migrations
from app.db.migrations import init_db

# Transcriptions
from app.db.transcriptions import (
    save_transcription,
    get_history,
    delete_transcription,
    delete_transcriptions_by_source,
    update_transcription_text,
    update_transcription_timestamp,
    get_transcription_by_source,
    update_analysis,
    update_task_status,
    update_ai_status,
    get_transcription,
    update_transcription_asr_model,
    update_transcription_is_subtitle,
    get_all_transcriptions_by_source,
    get_best_media_path_by_source,
    update_transcription_is_pinned,
)

# AI Summaries
from app.db.ai_summaries import (
    add_ai_summary,
    get_ai_summaries,
    clear_ai_summaries,
    delete_ai_summary,
    count_ai_summaries,
    batch_count_ai_summaries,
    update_ai_summary,
    get_ai_summaries_bulk,
)

# LLM Configuration
from app.db.llm_config import (
    get_all_providers,
    add_provider,
    update_provider,
    delete_provider,
    add_model,
    update_model,
    delete_model,
    set_active_model,
    get_active_model_full,
    get_llm_model_full_by_id,
)

# ASR Configuration
from app.db.asr_config import (
    add_asr_model,
    get_asr_models,
    delete_asr_model,
    set_active_asr_model,
    get_active_asr_model,
    get_active_model_for_engine,
    update_asr_model,
    get_first_asr_model_by_engine,
)

# Prompts
from app.db.prompts import (
    get_all_prompts,
    add_prompt,
    update_prompt,
    delete_prompt,
    get_all_categories,
    add_category,
    update_category,
    delete_category,
)

# System Config
from app.db.system_config import (
    get_system_config,
    set_system_config,
)

# Full-Text Search
from app.db.search import search_transcriptions

# Video Metadata
from app.db.video_meta import (
    get_video_meta,
    get_all_video_meta,
    upsert_video_meta,
    update_video_metadata,
    mark_stream_expired,
    update_cache_policy,
    clear_cache_policy,
    delete_video_meta,
    set_archived,
    batch_set_archived,
)

# Media Cache Entries (v9+)
from app.db.media_cache_entries import (
    get_cache_entries,
    batch_get_cache_counts,
    get_cache_entry,
    get_all_cache_entries,
    upsert_cache_entry,
    delete_cache_entry,
    delete_all_cache_entries,
    get_best_cache_path,
    get_cache_stats,
)

# Tags (v13+)
from app.db.tags import (
    get_all_tags,
    create_tag,
    update_tag,
    delete_tag,
    get_tags_for_video,
    set_video_tags,
    add_tag_to_video,
    remove_tag_from_video,
    batch_get_video_tags,
)

__all__ = [
    # Connection helpers
    "get_connection",
    "get_connection_with_row",
    
    # Migrations
    "init_db",
    
    # Transcriptions
    "save_transcription",
    "get_history",
    "delete_transcription",
    "delete_transcriptions_by_source",
    "update_transcription_text",
    "update_transcription_timestamp",
    "get_transcription_by_source",
    "update_analysis",
    "update_task_status",
    "update_ai_status",
    "get_transcription",
    "update_transcription_asr_model",
    "update_transcription_is_subtitle",
    "get_all_transcriptions_by_source",
    "get_best_media_path_by_source",
    "update_transcription_is_pinned",
    
    # AI Summaries
    "add_ai_summary",
    "get_ai_summaries",
    "clear_ai_summaries",
    "delete_ai_summary",
    "count_ai_summaries",
    "batch_count_ai_summaries",
    "update_ai_summary",
    "get_ai_summaries_bulk",
    
    # LLM Configuration
    "get_all_providers",
    "add_provider",
    "update_provider",
    "delete_provider",
    "add_model",
    "update_model",
    "delete_model",
    "set_active_model",
    "get_active_model_full",
    "get_llm_model_full_by_id",
    
    # ASR Configuration
    "add_asr_model",
    "get_asr_models",
    "delete_asr_model",
    "set_active_asr_model",
    "get_active_asr_model",
    "get_active_model_for_engine",
    "update_asr_model",
    "get_first_asr_model_by_engine",
    
    # Prompts
    "get_all_prompts",
    "add_prompt",
    "update_prompt",
    "delete_prompt",
    "get_all_categories",
    "add_category",
    "update_category",
    "delete_category",
    
    # System Config
    "get_system_config",
    "set_system_config",
    
    # Full-Text Search
    "search_transcriptions",
    
    # Video Metadata
    "get_video_meta",
    "get_all_video_meta",
    "upsert_video_meta",
    "update_video_metadata",
    "mark_stream_expired",
    "update_cache_policy",
    "clear_cache_policy",
    "delete_video_meta",
    "set_archived",
    "batch_set_archived",
    
    # Media Cache Entries (v9+)
    "get_cache_entries",
    "batch_get_cache_counts",
    "get_cache_entry",
    "get_all_cache_entries",
    "upsert_cache_entry",
    "delete_cache_entry",
    "delete_all_cache_entries",
    "get_best_cache_path",
    "get_cache_stats",
    
    # Tags (v13+)
    "get_all_tags",
    "create_tag",
    "update_tag",
    "delete_tag",
    "get_tags_for_video",
    "set_video_tags",
    "add_tag_to_video",
    "remove_tag_from_video",
    "batch_get_video_tags",
]
