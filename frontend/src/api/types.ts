/**
 * API Types for DiTing Backend
 */

// Video/Transcription types
export interface Video {
    id: number | null
    source_id: string
    source?: string
    source_type: 'bilibili' | 'youtube' | 'douyin' | 'file' | 'video' | 'audio'
    title: string
    cover: string
    last_updated: string             // Backend field name (not timestamp)
    latest_status?: string           // From most recent transcription
    is_analyzing_ai: boolean
    count: number                    // Backend field name (not segment_count)
    segment_count?: number           // Alternative field name
    ai_count: number                 // AI summary count
    is_subtitle: number | boolean    // Has subtitle (0/1 or boolean)
    media_path?: string
    stream_url?: string
    stream_expired?: boolean
    // v4 fields
    cache_expires_at?: string | null
    effective_expires_at?: string | null
    cache_policy?: 'keep_forever' | 'custom' | null
    notes?: string | null
    embed_url?: string | null
    is_archived?: boolean | number
    media_available?: boolean
    cache_count?: number
    original_source?: string
    segments?: Segment[]
    cache_versions?: CacheEntry[]
    tags?: Tag[]
}

export interface Tag {
    id: number
    name: string
    color: string
}

export interface Segment {
    id: number
    source: string
    original_source?: string
    raw_text: string
    text?: string  // Clean text without emotion tags
    timestamp: string
    segment_start: number
    segment_end: number | null
    source_type?: string
    asr_model: string | null
    is_subtitle: boolean | number
    status: string
    ai_status: string | null
    is_pinned?: boolean | number
    has_ai?: boolean
    summaries?: AISummary[]  // New: full summaries array
    // Legacy fields (may not be present)
    stream_url?: string | null
    stream_expired?: boolean
    user_prompt?: string
    ai_summary?: string
}

export interface AISummary {
    id: number
    transcription_id: number
    prompt: string
    summary: string
    model: string
    response_time: number | null
    parent_id: number | null
    timestamp: string
    children?: AISummary[]
}

// Pagination
export interface PaginatedVideos {
    total: number
    page: number
    limit: number
    items: Video[]
}

// Task types
export interface Task {
    id: number
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'cancelling'
    progress: number
    message: string
}

// LLM Config types
export interface LLMProvider {
    id: number
    name: string
    base_url: string
    api_key: string
    models: LLMModel[]
}

export interface LLMModel {
    id: number
    provider_id: number
    model_name: string
    is_active: boolean
}

// ASR Config types
export interface ASRModel {
    id: number
    name: string
    engine: string
    config: string
    is_active: boolean
}

// Prompt types
export interface Prompt {
    id: number
    name: string
    content: string
    category_id: number | null
    category_name: string | null
    category_key: string | null
}

export interface PromptCategory {
    id: number
    name: string
    key: string | null
    sort_order: number
}

// ASR Status Types
export interface ASRStatus {
    engines: Record<string, {
        type: string
        online: boolean
        latency: number
        url?: string
    }>
    config: {
        priority: string[]
        strict_mode: boolean
        active_engine: string | null
        active_model?: string | null
        disabled_engines: string[]
    }
}

// GC Candidate
export interface GCCandidate {
    source_id: string
    media_path: string
    filesize: number
    title: string
    reason: string
    policy: string
}

// Cache Management Types
export interface CacheEntry {
    id: number
    source_id: string
    quality: string
    media_path: string
    file_size: number
    cached_at: string
    video_title?: string
    video_cover?: string
    expires_at?: string | null
}

export interface CoverGCCandidate {
    filename: string
    size: number
    path: string
}

export interface CacheStats {
    file_count: number
    total_size_bytes: number
    total_size_mb: number
    total_size_gb: number
    by_quality: {
        quality: string
        count: number
        size: number
    }[]
    fs_file_count: number
    fs_total_size_bytes: number
    orphan_count: number
    warning_threshold_gb: number
    next_gc_time?: string | null
}

export interface DBOrphan {
    id: number
    source_id: string
    quality: string
    media_path: string
    full_path: string
}

export interface FSOrphan {
    filename: string
    path: string
    size: number
}

export interface IntegrityReport {
    db_orphans: DBOrphan[]
    fs_orphans: FSOrphan[]
}
