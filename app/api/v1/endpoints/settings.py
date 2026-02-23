"""
Settings Router
Unified settings management: LLM providers, ASR models, Prompts
RESTful API design under /api/settings/*
"""
import json
from fastapi import APIRouter, HTTPException

from app.db import (
    # LLM
    get_all_providers, add_provider, update_provider, delete_provider,
    add_model, update_model, delete_model, set_active_model,
    # ASR
    get_asr_models, add_asr_model, update_asr_model, delete_asr_model, set_active_asr_model,
    # Prompts
    get_all_prompts, add_prompt, update_prompt, delete_prompt,
    get_all_categories, add_category, update_category, delete_category
)
from app.core.logger import logger
from app.schemas import (
    LLMProviderCreate,
    LLMModelCreate,
    ASRModelCreate,
    PromptCreate,
    CategoryCreate,
)

router = APIRouter(prefix="/settings", tags=["Settings"])


# ============ LLM Providers ============

@router.get("/llm/providers")
async def get_llm_providers():
    """Get all LLM providers with their models"""
    return get_all_providers(include_models=True)


@router.post("/llm/providers")
async def create_llm_provider(provider: LLMProviderCreate):
    """Create a new LLM provider"""
    new_id = add_provider(provider.name, provider.base_url, provider.api_key)
    return {"id": new_id, "status": "success"}


@router.put("/llm/providers/{provider_id}")
async def update_llm_provider(provider_id: int, provider: LLMProviderCreate):
    """Update an existing LLM provider"""
    update_provider(provider_id, provider.name, provider.base_url, provider.api_key)
    return {"status": "success"}


@router.delete("/llm/providers/{provider_id}")
async def delete_llm_provider(provider_id: int):
    """Delete an LLM provider and its models"""
    delete_provider(provider_id)
    return {"status": "success"}


@router.post("/llm/providers/{provider_id}/models")
async def create_llm_model(provider_id: int, model: LLMModelCreate):
    """Add a model to an LLM provider"""
    model_id = add_model(provider_id, model.model_name)
    return {"id": model_id, "status": "success"}


@router.put("/llm/models/{model_id}")
async def update_llm_model(model_id: int, model: LLMModelCreate):
    """Update an LLM model"""
    update_model(model_id, model.model_name)
    return {"status": "success"}


@router.delete("/llm/models/{model_id}")
async def delete_llm_model(model_id: int):
    """Delete an LLM model"""
    delete_model(model_id)
    return {"status": "success"}


@router.post("/llm/models/{model_id}/activate")
async def activate_llm_model(model_id: int):
    """Set a model as the active model"""
    set_active_model(model_id)
    return {"status": "success"}


# ============ ASR Models ============

@router.get("/asr/models")
async def get_asr_models_list():
    """Get all ASR model configurations"""
    return get_asr_models()


@router.post("/asr/models")
async def create_asr_model(model: ASRModelCreate):
    """Create a new ASR model configuration"""
    try:
        json.loads(model.config)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON config: {e}")
    
    new_id = add_asr_model(model.name, model.engine, model.config)
    return {"id": new_id, "status": "success"}


@router.put("/asr/models/{model_id}")
async def update_asr_model_endpoint(model_id: int, model: ASRModelCreate):
    """Update an ASR model configuration"""
    try:
        json.loads(model.config)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON config: {e}")
    
    update_asr_model(model_id, model.name, model.engine, model.config)
    return {"status": "success"}


@router.delete("/asr/models/{model_id}")
async def delete_asr_model_endpoint(model_id: int):
    """Delete an ASR model configuration"""
    delete_asr_model(model_id)
    return {"status": "success"}


@router.post("/asr/models/{model_id}/activate")
async def activate_asr_model(model_id: int):
    """Set an ASR model as active"""
    set_active_asr_model(model_id)
    return {"status": "success"}


# ============ Prompts ============

@router.get("/prompts")
async def get_prompts():
    """Get all prompts with category info"""
    return get_all_prompts()


@router.post("/prompts")
async def create_prompt(prompt: PromptCreate):
    """Create a new prompt"""
    new_id = add_prompt(prompt.name, prompt.content, prompt.category_id)
    return {"id": new_id, "status": "success"}


@router.put("/prompts/{prompt_id}")
async def update_prompt_endpoint(prompt_id: int, prompt: PromptCreate):
    """Update an existing prompt"""
    update_prompt(prompt_id, prompt.name, prompt.content, prompt.category_id)
    return {"status": "success"}


@router.delete("/prompts/{prompt_id}")
async def delete_prompt_endpoint(prompt_id: int):
    """Delete a prompt"""
    delete_prompt(prompt_id)
    return {"status": "success"}


# ============ Prompt Categories ============

@router.get("/prompts/categories")
async def get_prompt_categories():
    """Get all prompt categories"""
    return get_all_categories()


@router.post("/prompts/categories")
async def create_prompt_category(category: CategoryCreate):
    """Create a new prompt category"""
    new_id = add_category(category.name, category.key)
    return {"id": new_id, "status": "success"}


@router.put("/prompts/categories/{category_id}")
async def update_prompt_category(category_id: int, category: CategoryCreate):
    """Update a prompt category"""
    update_category(category_id, category.name)
    return {"status": "success"}


@router.delete("/prompts/categories/{category_id}")
async def delete_prompt_category(category_id: int, delete_prompts: bool = False):
    """Delete a prompt category"""
    delete_category(category_id, delete_prompts)
    return {"status": "success"}
