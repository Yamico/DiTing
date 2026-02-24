import type { AISummary } from '../api/types'

// Helper: Clean emotion tags
export function cleanEmotionTags(text: string): string {
    return text.replace(/<\|[A-Z]+\|>/g, '').trim()
}

// Helper: Strip Subtitle Metadata
export function stripSubtitleMetadata(text: string): string {
    const lines = text.split('\n')
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
        let s = (lines[i] || '').trim()
        if (!s) continue

        // Pure number sequence line (SRT/WebVTT)
        if (/^\d+$/.test(s)) continue

        // SRT timestamp line: 00:00:00,000 --> 00:00:00,000
        if (/^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}.*/.test(s)) continue

        // WebVTT short format: 00:00.000 --> 00:00.000
        if (/^\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}.*/.test(s)) continue

        // WebVTT headers
        if (s.toUpperCase().startsWith('WEBVTT') || s.toUpperCase().startsWith('NOTE')) continue

        // Whisper inline timestamps: <|0.00|>
        s = s.replace(/<\|[\d.]+\|>/g, '').trim()

        // Inline bracket timestamps: [00:01:23] or (0:01:23)
        s = s.replace(/[\[\(]\d{1,5}:\d{2}(:\d{2})?\s*[\]\)]/g, '').trim()

        if (s) {
            result.push(s)
        }
    }
    return result.join('\n')
}

// Helper: Detect if text contains SRT/subtitle metadata
export function hasSrtMetadata(text: string): boolean {
    if (!text) return false
    // Check first 500 chars for common patterns
    const sample = text.slice(0, 500)
    // SRT timestamps: 00:00:00,000 --> 00:00:00,000
    if (/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}/.test(sample)) return true
    // WebVTT short: 00:00.000 --> 00:00.000
    if (/\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}/.test(sample)) return true
    // Whisper inline timestamps: <|0.00|>
    if (/<\|[\d.]+\|>/.test(sample)) return true
    return false
}

// Helper: Format time
export function formatTime(seconds: number | null): string {
    if (seconds === null || seconds === undefined) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Helper: Format date
export function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

// Helper: Treeify summaries
export function buildSummaryTree(summaries: AISummary[]): AISummary[] {
    const map = new Map<number, AISummary & { children?: AISummary[] }>()
    const roots: (AISummary & { children?: AISummary[] })[] = []

    // 1. Create map and init children
    summaries.forEach(s => {
        map.set(s.id, { ...s, children: [] })
    })

    // 2. Build tree
    summaries.forEach(s => {
        const node = map.get(s.id)!
        if (s.parent_id && map.has(s.parent_id)) {
            map.get(s.parent_id)!.children!.push(node)
        } else {
            roots.push(node)
        }
    })

    // 3. Sort by timestamp descending for roots? Or model?
    return roots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
