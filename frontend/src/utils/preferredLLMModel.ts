import type { LLMProvider } from '../api/types'

export const PREFERRED_LLM_MODEL_STORAGE_KEY = 'diting_preferred_llm_model_id'

export type PreferredLLMModelId = number | ''

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter {
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface PreferredLLMModelResolution {
  selectedModelId: PreferredLLMModelId
  shouldClearStoredPreference: boolean
}

export function loadPreferredLLMModelId(storage: StorageReader): PreferredLLMModelId {
  const raw = storage.getItem(PREFERRED_LLM_MODEL_STORAGE_KEY)
  if (!raw) {
    return ''
  }

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ''
}

export function savePreferredLLMModelId(storage: StorageWriter, modelId: PreferredLLMModelId): void {
  if (modelId === '') {
    storage.removeItem(PREFERRED_LLM_MODEL_STORAGE_KEY)
    return
  }

  storage.setItem(PREFERRED_LLM_MODEL_STORAGE_KEY, String(modelId))
}

export function resolvePreferredLLMModelId(
  providers: LLMProvider[],
  storedModelId: PreferredLLMModelId,
): PreferredLLMModelResolution {
  const allModels = providers.flatMap(provider => provider.models ?? [])

  if (storedModelId !== '' && allModels.some(model => model.id === storedModelId)) {
    return {
      selectedModelId: storedModelId,
      shouldClearStoredPreference: false,
    }
  }

  const activeModel = allModels.find(model => model.is_active)
  return {
    selectedModelId: activeModel?.id ?? '',
    shouldClearStoredPreference: storedModelId !== '',
  }
}
