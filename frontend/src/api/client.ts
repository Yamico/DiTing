/**
 * API Client for DiTing Backend
 * Uses RESTful endpoints
 */
import type { PaginatedVideos, Segment, Video, Task, LLMProvider, ASRModel, Prompt, PromptCategory, ASRStatus, GCCandidate, CoverGCCandidate, CacheEntry, CacheStats, IntegrityReport, Tag } from './types'

// ... (skipping to the end of file)



const API_BASE = '/api'

// Helper for fetch with error handling
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
}

// ============ Videos API ============


export interface GetVideosParams {
    page?: number
    limit?: number
    sourceType?: string
    status?: string
    tagId?: number
    excludeTagId?: number
    sortBy?: string
    hasSegments?: boolean
    hasAI?: boolean
    hasCached?: boolean
    isSubtitle?: boolean
    includeArchived?: string
    search?: string
}

export async function getVideos({
    page = 1,
    limit = 10,
    sourceType,
    status,
    tagId,
    excludeTagId,
    sortBy,
    hasSegments,
    hasAI,
    hasCached,
    isSubtitle,
    includeArchived,
    search
}: GetVideosParams = {}): Promise<PaginatedVideos> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })

    if (sourceType) params.set('source_type', sourceType)
    if (status) params.set('status', status)
    if (tagId) params.set('tag_id', String(tagId))
    if (excludeTagId) params.set('exclude_tag_id', String(excludeTagId))
    if (sortBy) params.set('sort_by', sortBy)
    if (hasSegments !== undefined) params.set('has_segments', String(hasSegments))
    if (hasAI !== undefined) params.set('has_ai', String(hasAI))
    if (hasCached !== undefined) params.set('has_cached', String(hasCached))
    if (isSubtitle !== undefined) params.set('is_subtitle', String(isSubtitle))
    if (includeArchived) params.set('include_archived', includeArchived)
    if (search) params.set('search', search)

    return fetchJson(`${API_BASE}/videos?${params}`)
}

export async function getVideo(sourceId: string): Promise<Video> {
    return fetchJson(`${API_BASE}/videos/${encodeURIComponent(sourceId)}`)
}

export function getVideoMediaUrl(sourceId: string, quality?: string): string {
    const url = `${API_BASE}/videos/${encodeURIComponent(sourceId)}/media`
    return quality ? `${url}?quality=${encodeURIComponent(quality)}` : url
}

export async function updateVideoCachePolicy(sourceId: string, policy: {
    cache_policy: 'keep_forever' | 'custom' | null,
    cache_expires_at?: string | null
}): Promise<void> {
    const encodedId = encodeURIComponent(sourceId);
    return fetchJson(`${API_BASE}/videos/${encodedId}/cache-policy`, {
        method: 'PATCH',
        body: JSON.stringify(policy),
    });
}

export async function updateVideoNotes(sourceId: string, notes: string): Promise<void> {
    const encodedId = encodeURIComponent(sourceId);
    await fetchJson(`${API_BASE}/videos/${encodedId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
    });
}

export async function getVideoSegments(sourceId: string): Promise<Segment[]> {
    return fetchJson(`${API_BASE}/videos/segments?source_id=${encodeURIComponent(sourceId)}`)
}

export async function deleteVideo(sourceId: string): Promise<void> {
    await fetchJson(`${API_BASE}/videos/${encodeURIComponent(sourceId)}`, { method: 'DELETE' })
}

export async function batchDeleteVideos(sourceIds: string[]): Promise<{ deleted_count: number; failed_ids: string[] }> {
    return fetchJson(`${API_BASE}/videos/batch-delete`, {
        method: 'POST',
        body: JSON.stringify({ source_ids: sourceIds }),
    })
}

export async function batchArchiveVideos(sourceIds: string[], isArchived: boolean): Promise<{ updated_count: number }> {
    return fetchJson(`${API_BASE}/videos/batch-archive`, {
        method: 'POST',
        body: JSON.stringify({ source_ids: sourceIds, is_archived: isArchived }),
    })
}

export async function archiveVideo(sourceId: string, isArchived: boolean): Promise<{ status: string }> {
    return fetchJson(`${API_BASE}/videos/${sourceId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ is_archived: isArchived }),
    })
}

export async function refreshMetadata(sourceId: string): Promise<{ title: string; cover: string }> {
    return fetchJson(`${API_BASE}/videos/${encodeURIComponent(sourceId)}/refresh`, { method: 'POST' })
}

// ============ Segments API ============

export async function getSegment(segmentId: number): Promise<Segment> {
    return fetchJson(`${API_BASE}/segments/${segmentId}`)
}

export async function updateSegmentText(segmentId: number, text: string): Promise<void> {
    await fetchJson(`${API_BASE}/segments/${segmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ raw_text: text }),
    })
}

export async function deleteSegment(segmentId: number): Promise<void> {
    await fetchJson(`${API_BASE}/segments/${segmentId}`, { method: 'DELETE' })
}

export async function toggleSegmentPin(segmentId: number, isPinned: boolean): Promise<{ is_pinned: boolean }> {
    return fetchJson(`${API_BASE}/segments/${segmentId}/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ is_pinned: isPinned }),
    })
}

// ============ Transcription API ============

export interface TranscribeUrlRequest {
    url: string
    source_id?: string
    use_uvr?: boolean
    language?: string
    prompt?: string
    task_type?: 'transcribe' | 'subtitle' | 'cache_only'
    quality?: string
    output_format?: string
    bookmark_only?: boolean
    auto_analyze_prompt?: string
    auto_analyze_prompt_id?: number
    auto_analyze_strip_subtitle?: boolean
}

export async function transcribeBilibili(request: TranscribeUrlRequest): Promise<{ task_id: number }> {
    return fetchJson(`${API_BASE}/transcribe/bilibili`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

export async function transcribeYoutube(request: TranscribeUrlRequest): Promise<{ task_id: number }> {
    return fetchJson(`${API_BASE}/transcribe/youtube`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

export async function transcribeDouyin(request: TranscribeUrlRequest): Promise<{ task_id: number }> {
    return fetchJson(`${API_BASE}/transcribe/douyin`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

export interface TranscribeNetworkRequest {
    url: string
    title?: string
    use_uvr?: boolean
    language?: string
    prompt?: string
    task_type?: 'transcribe' | 'subtitle' | 'cache_only'
    quality?: string
    output_format?: string
    bookmark_only?: boolean
    auto_analyze_prompt?: string
    auto_analyze_prompt_id?: number
    auto_analyze_strip_subtitle?: boolean
}

export async function transcribeNetwork(request: TranscribeNetworkRequest): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/transcribe/network`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

export interface RetranscribeRequest {
    source_id: string
    language?: string
    use_uvr?: boolean
    prompt?: string
    output_format?: string
    auto_analyze_prompt?: string
    auto_analyze_prompt_id?: number
    auto_analyze_strip_subtitle?: boolean
    only_get_subtitles?: boolean
    force_transcription?: boolean
}

export async function retranscribe(request: RetranscribeRequest): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/transcribe/retranscribe`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

// ============ Task API ============

export async function getTasks(): Promise<Record<string, Task>> {
    const data = await fetchJson<Record<string, Omit<Task, 'id'>>>(`${API_BASE}/tasks`)
    // Inject ID into the task object
    const tasksWithId: Record<string, Task> = {}
    Object.entries(data).forEach(([key, task]) => {
        tasksWithId[key] = { ...task, id: Number(key) } as Task
    })
    return tasksWithId
}

export async function cancelTask(taskId: number): Promise<void> {
    await fetchJson(`${API_BASE}/tasks/${taskId}/cancel`, { method: 'POST' })
}

// ============ AI Analysis API ============

export interface AnalyzeRequest {
    transcription_id: number
    prompt: string
    llm_model_id?: number
    parent_id?: number
    input_text?: string
    strip_subtitle?: boolean
}

export async function analyzeSegment(request: AnalyzeRequest): Promise<{ summary_id: number }> {
    return fetchJson(`${API_BASE}/analyze`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

export async function deleteSummary(summaryId: number): Promise<void> {
    await fetchJson(`${API_BASE}/summaries/${summaryId}`, { method: 'DELETE' })
}

export interface ManualSummaryRequest {
    transcription_id: number
    summary: string
    parent_id?: number
    prompt?: string
}

export async function createManualSummary(request: ManualSummaryRequest): Promise<void> {
    await fetchJson(`${API_BASE}/summaries/manual`, {
        method: 'POST',
        body: JSON.stringify(request),
    })
}

export async function updateManualSummary(id: number, summary: string): Promise<void> {
    await fetchJson(`${API_BASE}/summaries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ summary }),
    })
}

// ============ Settings API (RESTful) ============

// LLM Providers
export async function getLLMProviders(): Promise<LLMProvider[]> {
    return fetchJson(`${API_BASE}/settings/llm/providers`)
}

export async function addLLMProvider(data: { name: string; base_url: string; api_key: string }): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/settings/llm/providers`, { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteLLMProvider(id: number): Promise<void> {
    await fetchJson(`${API_BASE}/settings/llm/providers/${id}`, { method: 'DELETE' })
}

export async function updateLLMProvider(id: number, data: { name: string; base_url: string; api_key: string }): Promise<void> {
    await fetchJson(`${API_BASE}/settings/llm/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteLLMModel(modelId: number): Promise<void> {
    await fetchJson(`${API_BASE}/settings/llm/models/${modelId}`, { method: 'DELETE' })
}

export async function addLLMModel(providerId: number, modelName: string): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/settings/llm/providers/${providerId}/models`, {
        method: 'POST',
        body: JSON.stringify({ model_name: modelName }),
    })
}

export async function updateLLMModel(modelId: number, modelName: string): Promise<void> {
    await fetchJson(`${API_BASE}/settings/llm/models/${modelId}`, {
        method: 'PUT',
        body: JSON.stringify({ model_name: modelName }),
    })
}

export async function setActiveModel(modelId: number): Promise<void> {
    await fetchJson(`${API_BASE}/settings/llm/models/${modelId}/activate`, { method: 'POST' })
}

// ASR Models
export async function getASRModels(): Promise<ASRModel[]> {
    return fetchJson(`${API_BASE}/settings/asr/models`)
}

export async function setActiveASRModel(modelId: number): Promise<void> {
    await fetchJson(`${API_BASE}/settings/asr/models/${modelId}/activate`, { method: 'POST' })
}

export async function createASRModel(name: string, engine: string, config: string): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/settings/asr/models`, {
        method: 'POST',
        body: JSON.stringify({ name, engine, config }),
    })
}

export async function updateASRModel(id: number, name: string, engine: string, config: string): Promise<void> {
    await fetchJson(`${API_BASE}/settings/asr/models/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, engine, config }),
    })
}

export async function deleteASRModel(id: number): Promise<void> {
    await fetchJson(`${API_BASE}/settings/asr/models/${id}`, { method: 'DELETE' })
}

// Prompts CRUD
export async function getPrompts(): Promise<Prompt[]> {
    return fetchJson(`${API_BASE}/settings/prompts`)
}

export async function createPrompt(name: string, content: string, categoryId: number | null): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/settings/prompts`, {
        method: 'POST',
        body: JSON.stringify({ name, content, category_id: categoryId }),
    })
}

export async function updatePrompt(id: number, name: string, content: string, categoryId: number | null): Promise<void> {
    await fetchJson(`${API_BASE}/settings/prompts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, content, category_id: categoryId }),
    })
}

export async function deletePrompt(id: number): Promise<void> {
    await fetchJson(`${API_BASE}/settings/prompts/${id}`, { method: 'DELETE' })
}

// Prompt Categories CRUD
export async function getCategories(): Promise<PromptCategory[]> {
    return fetchJson(`${API_BASE}/settings/prompts/categories`)
}

export async function createCategory(name: string, key: string | null): Promise<{ id: number }> {
    return fetchJson(`${API_BASE}/settings/prompts/categories`, {
        method: 'POST',
        body: JSON.stringify({ name, key }),
    })
}

export async function updateCategory(id: number, name: string): Promise<void> {
    await fetchJson(`${API_BASE}/settings/prompts/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
    })
}

export async function deleteCategory(id: number, deletePrompts: boolean = false): Promise<void> {
    await fetchJson(`${API_BASE}/settings/prompts/categories/${id}?delete_prompts=${deletePrompts}`, {
        method: 'DELETE',
    })
}

// ============ System API ============

export async function getSystemConfig(key: string): Promise<string | null> {
    const response = await fetchJson<{ proxy_url?: string; bilibili_sessdata?: string }>(`${API_BASE}/system/settings`)
    return response[key as keyof typeof response] ?? null
}

export async function setSystemConfig(key: string, value: string): Promise<void> {
    await fetchJson(`${API_BASE}/system/settings`, {
        method: 'POST',
        body: JSON.stringify({ key, value }),
    })
}

export async function cleanCache(target_filenames?: string[]): Promise<{ deleted_count: number; freed_mb: number }> {
    return fetchJson(`${API_BASE}/system/clean_cache`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ target_filenames })
    })
}

export async function getMediaRetentionPolicy(): Promise<{ policy: string; days: number; cron_interval: number; capacity_gb: number }> {
    return fetchJson(`${API_BASE}/system/media_retention`)
}

export async function updateMediaRetentionPolicy(policy: string, days: number, cron_interval?: number, capacity_gb?: number): Promise<void> {
    await fetchJson(`${API_BASE}/system/media_retention`, {
        method: 'PUT',
        body: JSON.stringify({ policy, days, cron_interval, capacity_gb }),
    })
}

export async function getMediaStats(): Promise<CacheStats> {
    return fetchJson(`${API_BASE}/system/media_stats`)
}

export async function triggerMediaGC(targetSourceIds?: string[]): Promise<{ deleted_count: number; freed_mb: number }> {
    return fetchJson(`${API_BASE}/system/media_gc`, {
        method: 'POST',
        body: JSON.stringify({ target_source_ids: targetSourceIds })
    })
}

export async function getMediaGCCandidates(): Promise<{ count: number; total_size_bytes: number; items: GCCandidate[] }> {
    return fetchJson(`${API_BASE}/system/media_gc/candidates`)
}

export async function getCoverGCCandidates(): Promise<{ count: number; total_size_bytes: number; items: CoverGCCandidate[] }> {
    return fetchJson(`${API_BASE}/system/covers/gc-candidates`)
}

export async function deleteVideoCache(sourceId: string): Promise<{ status: string; deleted: boolean }> {
    return fetchJson(`${API_BASE}/videos/${encodeURIComponent(sourceId)}/cache`, { method: 'DELETE' })
}

// Management Center API
export async function getCacheEntries(): Promise<{ entries: CacheEntry[], total: number }> {
    return fetchJson(`${API_BASE}/system/cache/entries`)
}

export async function deleteCacheEntry(sourceId: string, quality: string): Promise<{ status: string; freed_bytes: number }> {
    return fetchJson(`${API_BASE}/system/cache/entries?source_id=${encodeURIComponent(sourceId)}&quality=${encodeURIComponent(quality)}`, {
        method: 'DELETE'
    })
}

export async function syncCacheIntegrity(): Promise<{ db_cleaned: number, orphans_found: number, details: any[] }> {
    return fetchJson(`${API_BASE}/system/cache/sync`, { method: 'POST' })
}

export async function batchCache(urls: string[], quality: string = 'best'): Promise<{ results: any[] }> {
    return fetchJson(`${API_BASE}/cache/batch`, {
        method: 'POST',
        body: JSON.stringify({ urls, quality }),
    })
}

export async function getCacheIntegrity(): Promise<IntegrityReport> {
    return fetchJson(`${API_BASE}/system/cache/integrity`)
}

export async function cleanupCacheIntegrity(type: 'fs_orphans' | 'db_orphans', targets?: string[] | number[]): Promise<any> {
    return fetchJson(`${API_BASE}/system/cache/cleanup`, {
        method: 'POST',
        body: JSON.stringify({ type, targets })
    })
}

// Launcher Config (ASR Engine + Load Model on Startup)
export interface LauncherConfig {
    asr_engine?: string
    load_model?: boolean
}

export async function getLauncherConfig(): Promise<LauncherConfig> {
    return fetchJson(`${API_BASE}/system/launcher-config`)
}

export async function setLauncherConfig(config: LauncherConfig): Promise<void> {
    await fetchJson(`${API_BASE}/system/launcher-config`, {
        method: 'POST',
        body: JSON.stringify(config),
    })
}

export async function getSystemVersion(): Promise<{ version: string; build: string; channel: string }> {
    return fetchJson(`${API_BASE}/system/version`)
}

export async function checkSystemUpdate(): Promise<{ update_available: boolean; current_version: string; latest_version: string; release_notes: string; download_url: string }> {
    return fetchJson(`${API_BASE}/system/check-update`)
}

// ============ Search API ============

export interface SearchResult {
    id: number
    source: string
    title: string
    cover: string | null
    source_type: string
    timestamp: string
    snippet: string
    score: number
}

export interface SearchResponse {
    query: string
    count: number
    results: SearchResult[]
}

export async function searchTranscriptions(query: string, limit: number = 50): Promise<SearchResponse> {
    return fetchJson(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`)
}

// Get expiring media
export async function getExpiringMedia(days: number = 1): Promise<{ candidates: any[] }> {
    const response = await fetch(`${API_BASE}/system/media_gc/expiring?days=${days}`)
    if (!response.ok) throw new Error('Failed to get expiring media')
    return response.json()
}

// ============ ASR Status API ============

export async function getASRStatus(refresh = false): Promise<ASRStatus> {
    const params = refresh ? '?refresh=true' : ''
    return fetchJson(`${API_BASE}/asr/status${params}`)
}

export async function updateASRConfig(config: { priority?: string[], strict_mode?: boolean, active_engine?: string, disabled_engines?: string[] }): Promise<void> {
    await fetchJson(`${API_BASE}/asr/config`, { method: 'POST', body: JSON.stringify(config) })
}

export async function toggleASRStrict(strict: boolean): Promise<void> {
    await updateASRConfig({ strict_mode: strict })
}

export async function toggleASREngineEnabled(engine: string, enabled: boolean): Promise<void> {
    const status = await getASRStatus()
    let disabled = status.config.disabled_engines || []
    if (enabled) {
        disabled = disabled.filter(e => e !== engine)
    } else {
        if (!disabled.includes(engine)) disabled.push(engine)
    }
    await updateASRConfig({ disabled_engines: disabled })
}

// --- Tags API ---

export async function getTags(): Promise<Tag[]> {
    return fetchJson(`${API_BASE}/tags`)
}

export async function createTag(name: string, color: string): Promise<Tag> {
    return fetchJson(`${API_BASE}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    })
}

export async function updateTag(id: number, data: { name?: string, color?: string }): Promise<void> {
    await fetchJson(`${API_BASE}/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
}

export async function deleteTag(id: number): Promise<void> {
    await fetchJson(`${API_BASE}/tags/${id}`, { method: 'DELETE' })
}

export async function setVideoTags(sourceId: string, tagIds: number[]): Promise<void> {
    await fetchJson(`${API_BASE}/videos/${encodeURIComponent(sourceId)}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: tagIds })
    })
}

export async function batchSetVideoTags(sourceIds: string[], tagIds: number[]): Promise<void> {
    await fetchJson(`${API_BASE}/videos/batch-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_ids: sourceIds, tag_ids: tagIds })
    })
}
