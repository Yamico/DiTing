import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createPrompt, getCategories, getPrompts } from '../api/client'
import type { Prompt } from '../api/types'
import { useToast } from '../contexts/ToastContext'
import { useSettingsStore } from '../stores/useSettingsStore'

const NOTE_ADDON_KEY = 'note_addon'

/**
 * Shared logic for the "Note add-on instructions" preset feature:
 * - lists saved presets (filtered by category_key === 'note_addon')
 * - saves a new preset under that category
 * - opens Settings → Prompt tab focused on the category
 */
export function useNotePromptPresets() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { showToast } = useToast()

    const { data: allPrompts = [] } = useQuery<Prompt[]>({
        queryKey: ['prompts'],
        queryFn: getPrompts,
    })
    const { data: allCategories = [] } = useQuery({
        queryKey: ['prompt_categories'],
        queryFn: getCategories,
    })

    const categoryId = useMemo(
        () => allCategories.find(c => c.key === NOTE_ADDON_KEY)?.id ?? null,
        [allCategories]
    )
    const presets = useMemo(
        () => allPrompts.filter(p => p.category_key === NOTE_ADDON_KEY),
        [allPrompts]
    )

    const saveMut = useMutation({
        mutationFn: ({ name, content }: { name: string; content: string }) =>
            createPrompt(name, content, categoryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] })
            showToast('success', t('detail.aiNotes.promptSavedSuccess'))
        },
        onError: () => showToast('error', t('detail.aiNotes.promptSaveFailed')),
    })

    const savePreset = (currentText: string) => {
        const trimmed = currentText.trim()
        if (!trimmed) return
        const name = window.prompt(t('detail.aiNotes.promptSavePromptName'), trimmed.slice(0, 30))
        if (name && name.trim()) {
            saveMut.mutate({ name: name.trim(), content: trimmed })
        }
    }

    const openManager = () => {
        useSettingsStore.getState().open({ tab: 'prompt', categoryKey: NOTE_ADDON_KEY })
    }

    return { presets, savePreset, openManager }
}
