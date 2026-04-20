import test from 'node:test'
import assert from 'node:assert/strict'

import type { LLMProvider } from '../src/api/types.ts'
import {
  PREFERRED_LLM_MODEL_STORAGE_KEY,
  loadPreferredLLMModelId,
  resolvePreferredLLMModelId,
  savePreferredLLMModelId,
} from '../src/utils/preferredLLMModel.ts'

type StorageState = Record<string, string>

function createStorage(initial: StorageState = {}) {
  const store = new Map(Object.entries(initial))

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

function createProviders(): LLMProvider[] {
  return [
    {
      id: 1,
      name: 'Provider A',
      base_url: '',
      api_key: '',
      models: [
        { id: 7, provider_id: 1, model_name: 'model-a', is_active: false },
      ],
    },
    {
      id: 2,
      name: 'Provider B',
      base_url: '',
      api_key: '',
      models: [
        { id: 8, provider_id: 2, model_name: 'model-b', is_active: true },
      ],
    },
  ]
}

test('loadPreferredLLMModelId returns empty when nothing stored', () => {
  const storage = createStorage()

  assert.equal(loadPreferredLLMModelId(storage), '')
})

test('loadPreferredLLMModelId ignores invalid stored values', () => {
  const storage = createStorage({ [PREFERRED_LLM_MODEL_STORAGE_KEY]: 'abc' })

  assert.equal(loadPreferredLLMModelId(storage), '')
})

test('savePreferredLLMModelId persists numeric model id', () => {
  const storage = createStorage()

  savePreferredLLMModelId(storage, 42)

  assert.equal(storage.getItem(PREFERRED_LLM_MODEL_STORAGE_KEY), '42')
})

test('savePreferredLLMModelId clears storage when model id is empty', () => {
  const storage = createStorage({ [PREFERRED_LLM_MODEL_STORAGE_KEY]: '42' })

  savePreferredLLMModelId(storage, '')

  assert.equal(storage.getItem(PREFERRED_LLM_MODEL_STORAGE_KEY), null)
})

test('resolvePreferredLLMModelId keeps stored model when still available', () => {
  const providers = createProviders()

  assert.deepEqual(resolvePreferredLLMModelId(providers, 7), {
    selectedModelId: 7,
    shouldClearStoredPreference: false,
  })
})

test('resolvePreferredLLMModelId falls back to active model when stored model is gone', () => {
  const providers = [
    {
      id: 1,
      name: 'Provider A',
      base_url: '',
      api_key: '',
      models: [
        { id: 8, provider_id: 1, model_name: 'model-b', is_active: true },
      ],
    },
  ] satisfies LLMProvider[]

  assert.deepEqual(resolvePreferredLLMModelId(providers, 7), {
    selectedModelId: 8,
    shouldClearStoredPreference: true,
  })
})

test('resolvePreferredLLMModelId returns empty when no model is stored or active', () => {
  const providers = [
    {
      id: 1,
      name: 'Provider A',
      base_url: '',
      api_key: '',
      models: [
        { id: 8, provider_id: 1, model_name: 'model-b', is_active: false },
      ],
    },
  ] satisfies LLMProvider[]

  assert.deepEqual(resolvePreferredLLMModelId(providers, ''), {
    selectedModelId: '',
    shouldClearStoredPreference: false,
  })
})
