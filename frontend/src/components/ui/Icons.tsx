/**
 * Unified Icon Components
 * All SVG icons used across the application
 * Usage: <Icons.Edit className="w-4 h-4" />
 */

interface IconProps {
    className?: string
    strokeWidth?: number
}

// Edit / Pencil
export function Edit({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
    )
}

// Lock
export function Lock({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
    )
}

// Trash / Delete
export function Trash({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    )
}

// X / Close
export function X({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M6 18L18 6M6 6l12 12" />
        </svg>
    )
}

// Check / Success
export function Check({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 13l4 4L19 7" />
        </svg>
    )
}

// Alert / Warning
export function AlertTriangle({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    )
}

// Info
export function Info({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

// Search / Magnifying Glass
export function Search({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    )
}

// Plus
export function Plus({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M12 4v16m8-8H4" />
        </svg>
    )
}

// Refresh / Rotate
export function Refresh({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    )
}

// Play
export function Play({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

// Chevron Down
export function ChevronDown({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M19 9l-7 7-7-7" />
        </svg>
    )
}

// Chevron Up
export function ChevronUp({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 15l7-7 7 7" />
        </svg>
    )
}

// Chevron Right
export function ChevronRight({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M9 5l7 7-7 7" />
        </svg>
    )
}

// Arrow Left
export function ArrowLeft({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
    )
}

// Sparkles / AI
export function Sparkles({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
    )
}

// Folder
export function Folder({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
    )
}

// Globe
export function Globe({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
    )
}

// Undo
export function Undo({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
    )
}

// Code / Source View
export function Code({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
    )
}

// Cloud
export function Cloud({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
    )
}

// Zap / Lightning
export function Zap({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
    )
}

// Save / Floppy
export function Save({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} points="17 21 17 13 7 13 7 21" />
            <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} points="7 3 7 8 15 8" />
        </svg>
    )
}

// Github
export function Github({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
    )
}

// External Link
export function ExternalLink({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    )
}

// FileText / Document / Markdown
export function FileText({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    )
}

// Clipboard / Copy
export function Clipboard({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
    )
}

// MoreHorizontal / Three Dots Menu
export function MoreHorizontal({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
    )
}

// ArrowsHorizontal / Diff / Compare
export function ArrowsHorizontal({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
    )
}

// RotateCw / Resync / Regenerate
export function RotateCw({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M23 4v6h-6M1 20v-6h6" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
    )
}
// Settings / Gear
export function Settings({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )
}

// Loader / Spinner
export function Loader({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    )
}

// Video / Film
export function Video({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    )
}

// Music / Audio
export function Music({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12 0a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )
}

// Cpu / Chip
export function Cpu({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
    )
}

// CheckCircle
export function CheckCircle({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

// XCircle
export function XCircle({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

// AlertCircle
export function AlertCircle({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

// Slash / Ban
export function Slash({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
    )
}

// Sun
export function Sun({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="5" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="1" x2="12" y2="3" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="21" x2="12" y2="23" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="1" y1="12" x2="3" y2="12" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="21" y1="12" x2="23" y2="12" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// Moon
export function Moon({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    )
}

// MessageCircle / Chat / Refine Question
export function MessageCircle({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
    )
}

// Bookmark
export function Bookmark({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
    )
}

// Layers
export function Layers({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
    )
}

// Clock
export function Clock({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

// Bot
export function Bot({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
    )
}

// Mic
export function Mic({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
    )
}

// Subtitles / Closed Captions
export function Subtitles({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M7 13h4M15 13h2M7 17h2M13 17h4" />
        </svg>
    )
}

// Layout / Embed
export function Layout({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 12h16" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M9 12v9" />
        </svg>
    )
}

// Lightbulb / Tip
export function Lightbulb({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548 5.47A1 1 0 0114.05 22H9.95a1 1 0 01-.995-1.108l-.548-5.47z" />
        </svg>
    )
}

// Image / Picture
export function Image({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    )
}

// Download
export function Download({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
    )
}

// Upload
export function Upload({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
    )
}

// UploadCloud
export function UploadCloud({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M16 16l-4-4-4 4M12 12v9" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
        </svg>
    )
}

// Export all as namespace for easy usage: Icons.Edit, Icons.Trash, etc.
const Icons = {
    Edit,
    Trash,
    X,
    Check,
    AlertTriangle,
    Info,
    Search,
    Plus,
    Refresh,
    Lock,
    Play,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    ArrowLeft,
    Sparkles,
    Folder,
    Globe,
    Undo,
    Code,
    FileText,
    Clipboard,
    MoreHorizontal,
    ArrowsHorizontal,
    RotateCw,
    Settings,
    Loader,
    Video,
    Music,
    Cpu,
    CheckCircle,
    XCircle,
    AlertCircle,
    Slash,
    Sun,
    Moon,
    MessageCircle,
    ExternalLink,
    Github,
    Cloud,
    Zap,
    Save,
    Bookmark,
    Layers,
    Clock,
    Bot,
    Mic,
    Subtitles,
    Layout,
    Lightbulb,
    // Square / Unchecked
    Square: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth={strokeWidth} />
        </svg>
    ),
    // CheckSquare / Checked
    CheckSquare: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth={strokeWidth} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M9 11l3 3L22 4" />
        </svg>
    ),
    Image,
    Quote: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M10 14h4m-2 4v-4m6-10l-2.09 6.26a2 2 0 01-1.91 1.34H11V5.4L13.1 2.3a1 1 0 011.3 0L16 4zM6 9H4v12h12v-2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M8 9h.01" />
        </svg>
    ),
    MessageSquare: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    ),
    Server: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M20 16.2A4.5 4.5 0 0 0 3.2 14M20 7.8A4.5 4.5 0 0 1 3.2 10M2 12h20M12 2v20" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M12 2v20" />
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
    ),
    MoreVertical: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="1" strokeWidth={strokeWidth} />
            <circle cx="12" cy="5" r="1" strokeWidth={strokeWidth} />
            <circle cx="12" cy="19" r="1" strokeWidth={strokeWidth} />
        </svg>
    ),

    GitCommit: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" strokeWidth={strokeWidth} />
            <line x1="1.05" y1="12" x2="7" y2="12" strokeWidth={strokeWidth} strokeLinecap="round" />
            <line x1="17.01" y1="12" x2="22.96" y2="12" strokeWidth={strokeWidth} strokeLinecap="round" />
        </svg>
    ),
    // Management Icons
    Database,
    LayoutDashboard,
    HardDrive,
    Wrench,
    FileVideo,
    Pin: ({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="17" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
    ),
    Download,
    Monitor,
    Activity,
    Eye,
    EyeOff,
    Upload,
    UploadCloud,
    List: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    ),
    ListFilter: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
    ),
    Tags: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
    ),
    Archive,
    ArchiveRestore,
    SplitSquareHorizontal: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M8 19H5C3.89543 19 3 18.1046 3 17V7C3 5.89543 3.89543 5 5 5H19C20.1046 5 21 5.89543 21 7V17C21 18.1046 20.1046 19 19 19H16M3 12H21" />
        </svg>
    ),
    ArrowUpDown: ({ className, strokeWidth }: IconProps) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" />
        </svg>
    )
}

// Database
export function Database({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 5c0 1.657 4.03 3 9 3s9-1.343 9-3m-9 3v14m-9-14a9 9 0 0118 0" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 19c0 1.657 4.03 3 9 3s9-1.343 9-3" />
        </svg>
    )
}

// Activity / Pulse
export function Activity({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
        </svg>
    )
}

// Eye / View
export function Eye({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// EyeOff / Hide
export function EyeOff({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
        </svg>
    )
}

// LayoutDashboard
export function LayoutDashboard({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 4h6v8H4zM4 16h6v4H4zM14 4h6v4h-6zM14 12h6v8h-6z" />
        </svg>
    )
}

// HardDrive
export function HardDrive({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M22 12H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M6 16h.01M10 16h.01" />
        </svg>
    )
}

// Wrench
export function Wrench({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
    )
}

// FileVideo
export function FileVideo({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
            <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} points="14 2 14 8 20 8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M10 14h4" />
        </svg>
    )
}
// Monitor / System
export function Monitor({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    )
}

// Archive
export function Archive({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg
            className={className}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
        </svg>
    )
}

// Archive Restore
export function ArchiveRestore({ className = 'w-4 h-4', strokeWidth = 2 }: IconProps) {
    return (
        <svg
            className={className}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="m9 15 3-3 3 3" />
            <path d="M12 12v7" />
        </svg>
    )
}

export default Icons

