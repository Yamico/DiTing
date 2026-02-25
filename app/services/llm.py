import os
import time
from openai import AsyncOpenAI

# load_dotenv() - Removed

from app.db import get_active_model_full, get_llm_model_full_by_id
from app.core.logger import logger

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
    
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

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


async def test_llm_connection(api_key: str, base_url: str, model: str, api_type: str = 'chat_completions'):
    """
    Test LLM provider connectivity with a minimal request.
    Returns { success: bool, message: str, latency_ms: int }
    """
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
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
