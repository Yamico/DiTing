import os
import time
import httpx
from openai import AsyncOpenAI

# load_dotenv() - Removed

from app.db import get_active_model_full, get_llm_model_full_by_id
from app.core.logger import logger

_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# Client cache: reuse connections across requests (keyed by base_url + api_key + proxy)
_client_cache: dict[tuple[str, str, str], AsyncOpenAI] = {}


def _get_proxy_url() -> str | None:
    """Read proxy_url from system config (DB)."""
    from app.db import get_system_config
    raw = (get_system_config("proxy_url") or "").strip()
    return raw if raw.startswith(("http://", "https://", "socks")) else None


def _get_llm_client(api_key: str, base_url: str) -> AsyncOpenAI:
    """Get or create a cached AsyncOpenAI client with proxy & timeout configured."""
    proxy_url = _get_proxy_url()
    cache_key = (base_url, api_key, proxy_url or "")

    cached = _client_cache.get(cache_key)
    if cached:
        return cached

    kwargs: dict = {
        "api_key": api_key,
        "base_url": base_url,
        "default_headers": {"User-Agent": _USER_AGENT},
        "timeout": 300.0,
        "max_retries": 1,
    }
    if proxy_url:
        logger.info(f"🌐 LLM using proxy: {proxy_url}")
        kwargs["http_client"] = httpx.AsyncClient(proxy=proxy_url)

    client = AsyncOpenAI(**kwargs)
    _client_cache[cache_key] = client
    return client

async def analyze_text(text: str, prompt: str, llm_model_id: int = None):
    """
    Sends text and user prompt to LLM for processing.
    """
    db_config = None
    
    # 1. Try specific model if requested
    if llm_model_id:
        # Try new system first (Provider/Model)
        model_info = get_llm_model_full_by_id(llm_model_id)
        if model_info:
             db_config = {
                'api_key': model_info['api_key'],
                'base_url': model_info['base_url'],
                'model': model_info['model_name'],
                'api_type': model_info.get('api_type', 'chat_completions')
            }
        else:
             # Try legacy config
             from app.db import get_llm_config_by_id
             db_config = get_llm_config_by_id(llm_model_id)
    
    # 2. Try active model (New System)
    if not db_config:
        model_info = get_active_model_full()
        if model_info:
            db_config = {
                'api_key': model_info['api_key'],
                'base_url': model_info['base_url'],
                'model': model_info['model_name'],
                'api_type': model_info.get('api_type', 'chat_completions')
            }

    if not db_config:
        logger.error("❌ No active LLM model configured in database.")
        return "❌ 请先在系统设置中配置并激活大语言模型(LLM)。", "unknown"
        
    api_key = db_config.get('api_key')
    base_url = db_config.get('base_url')
    model = db_config.get('model')
    api_type = db_config.get('api_type', 'chat_completions')

    logger.info(f"🤖 LLM Request -> Model: {model} | BaseURL: {base_url} | Protocol: {api_type}")

    if not api_key:
        return "❌ LLM API Key is missing. 请在系统设置中配置有效的 API Key。", model
    client = _get_llm_client(api_key, base_url)

    sys_prompt = (
    "你是一个专业的内容精炼专家，擅长处理多方对话及单人演讲的语音转文字(ASR)材料。\n"
    "你的核心任务是：\n"
    "1. **语境纠错**：结合上下文纠正同音错别字。\n"
    "2. **噪音处理**：除非用户明确要求保留口癖，否则默认剔除'呃'、'那个'、'然后'等语气词，缝合破碎的句子。\n"
    "3. **对话梳理**：若文中出现多个发言者，请自动根据语境理顺逻辑关系，确保语义连贯。\n"
    "4. **保持真实**：在提升可读性的同时，严禁虚构原始文本中不存在的事实。\n"
    "5. **忠实度**：如果用户要求'逐字稿'或'保留口癖'，请务必原样保留所有语气词，这对于心理分析或语气研究至关重要。\n"
    )
    user_content = f"""
[TASK_INSTRUCTIONS]
{prompt}

[RAW_TRANSCRIPT_START]
{text}
[RAW_TRANSCRIPT_END]
"""

    try:
        if api_type == 'responses':
            response = await client.responses.create(
                model=model,
                instructions=sys_prompt,
                input=user_content,
                temperature=0.7
            )
            return response.output_text, model
        else:
            # Default: chat_completions
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content, model
    except Exception as e:
        logger.error(f"❌ LLM Error: {str(e)}")
        return f"❌ LLM Error: {str(e)}", model


def create_analysis_stream(text: str, prompt: str, llm_model_id: int = None, messages_override=None):
    """
    Set up streaming LLM analysis.
    Returns (model_name, async_generator_of_text_chunks).
    If messages_override is provided, it is used directly as the messages array
    (text and prompt are ignored). This supports custom multi-turn conversations.
    Raises ValueError if no LLM config available.
    """
    db_config = None

    if llm_model_id:
        model_info = get_llm_model_full_by_id(llm_model_id)
        if model_info:
            db_config = {
                'api_key': model_info['api_key'],
                'base_url': model_info['base_url'],
                'model': model_info['model_name'],
                'api_type': model_info.get('api_type', 'chat_completions')
            }
        else:
            from app.db import get_llm_config_by_id
            db_config = get_llm_config_by_id(llm_model_id)

    if not db_config:
        model_info = get_active_model_full()
        if model_info:
            db_config = {
                'api_key': model_info['api_key'],
                'base_url': model_info['base_url'],
                'model': model_info['model_name'],
                'api_type': model_info.get('api_type', 'chat_completions')
            }

    if not db_config:
        raise ValueError("请先在系统设置中配置并激活大语言模型(LLM)。")

    api_key = db_config.get('api_key')
    base_url = db_config.get('base_url')
    model = db_config.get('model')
    api_type = db_config.get('api_type', 'chat_completions')

    if not api_key:
        raise ValueError("LLM API Key is missing. 请在系统设置中配置有效的 API Key。")

    logger.info(f"🤖 LLM Stream Request -> Model: {model} | BaseURL: {base_url} | Protocol: {api_type}")

    client = _get_llm_client(api_key, base_url)

    sys_prompt = (
        "你是一个专业的内容精炼专家，擅长处理多方对话及单人演讲的语音转文字(ASR)材料。\n"
        "你的核心任务是：\n"
        "1. **语境纠错**：结合上下文纠正同音错别字。\n"
        "2. **噪音处理**：除非用户明确要求保留口癖，否则默认剔除'呃'、'那个'、'然后'等语气词，缝合破碎的句子。\n"
        "3. **对话梳理**：若文中出现多个发言者，请自动根据语境理顺逻辑关系，确保语义连贯。\n"
        "4. **保持真实**：在提升可读性的同时，严禁虚构原始文本中不存在的事实。\n"
        "5. **忠实度**：如果用户要求'逐字稿'或'保留口癖'，请务必原样保留所有语气词，这对于心理分析或语气研究至关重要。\n"
    )
    user_content = f"""
[TASK_INSTRUCTIONS]
{prompt}

[RAW_TRANSCRIPT_START]
{text}
[RAW_TRANSCRIPT_END]
"""

    # Build messages: use override if provided, else default analysis format
    if messages_override:
        chat_messages = messages_override
    else:
        chat_messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_content}
        ]

    async def _stream():
        if api_type == 'responses':
            instructions = sys_prompt
            inp = user_content
            if messages_override:
                if isinstance(messages_override, dict):
                    instructions = messages_override.get("instructions", "")
                    inp = messages_override.get("input", [])
                else:
                    sys_msgs = [m for m in messages_override if m["role"] == "system"]
                    instructions = sys_msgs[0]["content"] if sys_msgs else ""
                    non_sys = [m for m in messages_override if m["role"] != "system"]
                    inp = non_sys[-1]["content"] if non_sys else ""
            stream = await client.responses.create(
                model=model,
                instructions=instructions or None,
                input=inp,
                temperature=0.7,
                stream=True
            )
            async for event in stream:
                if getattr(event, 'type', None) == 'response.output_text.delta':
                    yield event.delta
        else:
            stream = await client.chat.completions.create(
                model=model,
                messages=chat_messages,
                temperature=0.7,
                stream=True
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

    return model, _stream()


async def test_llm_connection(api_key: str, base_url: str, model: str, api_type: str = 'chat_completions'):
    """
    Test LLM provider connectivity with a minimal request.
    Returns { success: bool, message: str, latency_ms: int }
    """
    proxy_url = _get_proxy_url()
    kwargs: dict = {
        "api_key": api_key,
        "base_url": base_url,
        "default_headers": {"User-Agent": _USER_AGENT},
        "timeout": 30.0,
        "max_retries": 0,
    }
    if proxy_url:
        kwargs["http_client"] = httpx.AsyncClient(proxy=proxy_url)
    client = AsyncOpenAI(**kwargs)
    start = time.time()
    try:
        if api_type == 'responses':
            resp = await client.responses.create(
                model=model,
                input="Hi",
                max_output_tokens=5
            )
        else:
            resp = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5
            )
        latency = round((time.time() - start) * 1000)
        return {"success": True, "message": "OK", "latency_ms": latency}
    except Exception as e:
        latency = round((time.time() - start) * 1000)
        return {"success": False, "message": str(e), "latency_ms": latency}


async def fetch_available_models(api_key: str, base_url: str):
    """
    Fetch available models from an OpenAI-compatible provider.
    Uses raw HTTP GET /models to avoid openai SDK Pydantic parsing issues
    with non-standard API responses.
    Returns { success: bool, models: list[{id, owned_by}], message: str }
    """
    import httpx

    # Normalize base_url: ensure no trailing slash
    url = base_url.rstrip("/") + "/models"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        # OpenAI format: { "data": [ { "id": "gpt-4o", "owned_by": "openai", ... } ] }
        # Some providers return: { "models": [ ... ] } or just [ ... ]
        raw_models = data.get("data") or data.get("models") or (data if isinstance(data, list) else [])

        models = []
        for m in raw_models:
            if isinstance(m, str):
                models.append({"id": m, "owned_by": ""})
            elif isinstance(m, dict):
                model_id = m.get("id") or m.get("name") or m.get("model") or ""
                if model_id:
                    models.append({"id": model_id, "owned_by": m.get("owned_by", "")})

        models.sort(key=lambda x: x["id"])
        return {"success": True, "models": models, "message": "OK"}
    except Exception as e:
        logger.error(f"❌ Failed to fetch models from {base_url}: {e}")
        return {"success": False, "models": [], "message": str(e)}
