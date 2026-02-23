import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export interface UploadOptions {
    taskType: 'transcribe' | 'subtitle'
    useUvr: boolean
    language: string
    prompt?: string
    outputFormat?: string
}

export interface ChunkedUploadState {
    phase: 'idle' | 'initializing' | 'uploading' | 'finalizing' | 'done' | 'error' | 'cancelled'
    progress: number // 0-100
    uploadedBytes: number
    totalBytes: number
    uploadedChunks: number
    totalChunks: number
    speed: string // e.g. "12.3 MB/s"
    eta: string // e.g. "2:35"
    error: string | null
    uploadId: string | null
}

const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB default

export function useChunkedUpload() {
    const { t } = useTranslation()

    const [state, setState] = useState<ChunkedUploadState>({
        phase: 'idle',
        progress: 0,
        uploadedBytes: 0,
        totalBytes: 0,
        uploadedChunks: 0,
        totalChunks: 0,
        speed: '0 MB/s',
        eta: '--:--',
        error: null,
        uploadId: null,
    })

    const abortControllerRef = useRef<AbortController | null>(null)
    const stateRef = useRef(state)
    stateRef.current = state

    const updateState = (updates: Partial<ChunkedUploadState>) => {
        setState((prev) => ({ ...prev, ...updates }))
    }

    const formatSpeed = (bytesPerSec: number) => {
        if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
        if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    }

    const formatETA = (seconds: number) => {
        if (!isFinite(seconds) || seconds < 0) return '--:--'
        if (seconds < 60) return `${Math.ceil(seconds)}s`
        const m = Math.floor(seconds / 60)
        const s = Math.floor(seconds % 60)
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const cancel = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }

        const { uploadId } = stateRef.current
        if (uploadId) {
            try {
                await fetch(`/api/upload/${uploadId}`, { method: 'DELETE' })
            } catch (e) {
                console.error('Failed to clean up cancelled upload on server', e)
            }
        }

        updateState({ phase: 'cancelled', error: null })
    }, [])

    const start = useCallback(async (file: File, options: UploadOptions, existingUploadId?: string, receivedChunks?: number[]) => {
        updateState({
            phase: 'initializing',
            error: null,
            totalBytes: file.size,
            uploadedBytes: 0,
            progress: 0,
            speed: '0 MB/s',
            eta: '--:--',
        })

        abortControllerRef.current = new AbortController()
        const signal = abortControllerRef.current.signal

        try {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
            let uploadId = existingUploadId
            const chunksToSkip = new Set(receivedChunks || [])

            // 1. Init
            if (!uploadId) {
                const initData = new FormData()
                initData.append('filename', file.name)
                initData.append('file_size', file.size.toString())
                initData.append('total_chunks', totalChunks.toString())
                initData.append('task_type', options.taskType)
                initData.append('use_uvr', String(options.useUvr))
                initData.append('language', options.language)
                if (options.prompt) initData.append('prompt', options.prompt)
                if (options.outputFormat) initData.append('output_format', options.outputFormat)

                const initRes = await fetch('/api/upload/init', {
                    method: 'POST',
                    body: initData,
                    signal
                })

                if (!initRes.ok) throw new Error(t('upload.initFailed', 'Failed to initialize upload'))
                const initJson = await initRes.json()
                uploadId = initJson.upload_id
            }

            if (!uploadId) throw new Error('Missing upload_id')
            updateState({ phase: 'uploading', uploadId, totalChunks })

            // 2. Upload chunks sequentially
            let uploadedCount = chunksToSkip.size
            let uploadedBytesTotal = uploadedCount * CHUNK_SIZE
            // Clamp uploadedBytesTotal so it doesn't exceed file size
            if (uploadedBytesTotal > file.size) uploadedBytesTotal = file.size

            const windowSize = 5 // items for moving average
            let speedSamples: { bytes: number, time: number }[] = []
            let lastSpeedUpdateTime = Date.now()

            for (let i = 0; i < totalChunks; i++) {
                if (signal.aborted) throw new Error('Aborted')
                if (chunksToSkip.has(i)) continue

                const startByte = i * CHUNK_SIZE
                const endByte = Math.min(startByte + CHUNK_SIZE, file.size)
                const chunk = file.slice(startByte, endByte)
                const chunkData = new FormData()

                chunkData.append('upload_id', uploadId)
                chunkData.append('index', i.toString())
                chunkData.append('file', chunk, `${file.name}.part${i}`)

                const chunkStartTime = Date.now()

                const chunkRes = await fetch('/api/upload/chunk', {
                    method: 'POST',
                    body: chunkData,
                    signal
                })

                if (!chunkRes.ok) throw new Error(t('upload.chunkFailed', 'Failed to upload chunk'))

                const chunkEndTime = Date.now()
                const durationMs = Math.max(1, chunkEndTime - chunkStartTime)
                const bytesTransferred = chunk.size

                uploadedCount++
                uploadedBytesTotal += bytesTransferred

                // Calculate rolling speed
                speedSamples.push({ bytes: bytesTransferred, time: durationMs })
                if (speedSamples.length > windowSize) speedSamples.shift()

                // Update UI at most every ~200ms to avoid DOM thrashing
                if (Date.now() - lastSpeedUpdateTime > 200 || uploadedCount === totalChunks) {
                    const totalBytesRecent = speedSamples.reduce((sum, s) => sum + s.bytes, 0)
                    const totalTimeRecentMs = speedSamples.reduce((sum, s) => sum + s.time, 0)

                    const bytesPerSec = (totalBytesRecent / totalTimeRecentMs) * 1000
                    const remainingBytes = file.size - uploadedBytesTotal
                    const secondsRemaining = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0

                    updateState({
                        uploadedChunks: uploadedCount,
                        uploadedBytes: uploadedBytesTotal,
                        progress: Math.min(100, Math.round((uploadedBytesTotal / file.size) * 100)),
                        speed: formatSpeed(bytesPerSec),
                        eta: formatETA(secondsRemaining)
                    })
                    lastSpeedUpdateTime = Date.now()
                }
            }

            // 3. Finalize
            if (signal.aborted) throw new Error('Aborted')
            updateState({ phase: 'finalizing', progress: 100, speed: '0 MB/s', eta: '--:--' })

            const finalData = new FormData()
            finalData.append('upload_id', uploadId)

            const finalRes = await fetch('/api/upload/finalize', {
                method: 'POST',
                body: finalData,
                signal
            })

            if (!finalRes.ok) {
                const err = await finalRes.json()
                throw new Error(err.detail || t('upload.finalizeFailed', 'Processing failed'))
            }

            updateState({ phase: 'done' })
            return await finalRes.json()

        } catch (e: any) {
            if (e.name === 'AbortError' || e.message === 'Aborted') {
                // Cancel sets phase to cancelled already
            } else {
                updateState({ phase: 'error', error: e.message })
                throw e
            }
        } finally {
            abortControllerRef.current = null
        }
    }, [t])

    return {
        state,
        start,
        cancel,
    }
}
