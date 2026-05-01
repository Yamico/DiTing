"""
Database Seed Module
Populates default data for fresh installations.
Each seed function checks for existing data to remain idempotent.
"""
from app.core.logger import logger


def seed_all(cursor):
    """Run all seed operations. Safe to call multiple times."""
    seed_prompt_categories_and_prompts(cursor)
    ensure_builtin_categories(cursor)


def ensure_builtin_categories(cursor):
    """Ensure built-in prompt categories exist. Idempotent — safe on every startup.

    Adds categories that were introduced after the initial seed so existing
    installs pick them up without a schema-version bump.
    """
    builtins = [
        # (name, key, sort_order)
        ("笔记附加指令", "note_addon", 10),
    ]
    for name, key, sort in builtins:
        cursor.execute("SELECT id FROM prompt_categories WHERE key = ?", (key,))
        if cursor.fetchone():
            continue
        cursor.execute(
            "INSERT INTO prompt_categories (name, key, sort_order) VALUES (?, ?, ?)",
            (name, key, sort)
        )
        logger.info(f"🌱 Added built-in prompt category: {key}")
def seed_prompt_categories_and_prompts(cursor):
    """Seed default prompt categories and prompt templates."""
    cursor.execute("SELECT COUNT(*) FROM prompt_categories")
    if cursor.fetchone()[0] > 0:
        return

    logger.info("🌱 Seeding default AI Categories & Prompts...")

    cats = [
        ("全部", "all", 0), ("摘要", "summary", 1), ("二级提炼", "refine", 2),
        ("一站式", "onestop", 3), ("自定义", "custom", 99)
    ]
    cat_map = {}
    for name, key, sort in cats:
        cursor.execute(
            "INSERT INTO prompt_categories (name, key, sort_order) VALUES (?, ?, ?)",
            (name, key, sort)
        )
        cat_map[key] = cursor.lastrowid

    defaults = [
        ("💬 对话复盘", "summary", "【场景：对话分析】这是一段多人对话。请你：1. 识别不同发言者的意图；2. 整理对话的逻辑链路；3. 总结双方达成的共识与遗留的分歧；4. 过滤掉无效的寒暄。"),
        ("📝 会议纪要", "summary", "【场景：会议纪要】请根据这段对话/发言，整理出：会议主题、核心议程、决议事项、以及具体的待办清单（Action Items），使用清晰的 Markdown 表格或列表展示。"),
        ("📚 学术/技术讲座", "summary", "【场景：知识提取】重点识别并保护专业术语。请将内容整理为逻辑严密的笔记，包含：核心定义、原理描述、以及案例分析。若有公式或代码描述，请精准还原。"),
        ("🎤 原味观点提炼", "refine", "【场景：原味提炼】请从对话中提炼核心观点。要求：\n1. 每个观点配一个简洁的【标题】。\n2. 标题下方必须紧跟对应的【原话引用】。\n3. **特别注意**：引用的原话必须保持逐字还原，严禁剔除‘呃、啊、那个、然后’等口癖，不要进行任何精简或美化。\n4. 格式参考：\n### 观点名称\n“这里是保留了所有口癖的原始说话内容...”"),
        ("🎤 逐字还原", "refine", "【场景：语言学/心理分析】请注意：这是一个特殊的逐字还原任务。请**严禁**剔除任何语气助词（如：呃、啊、那个、就是、然后等）。你需要完整保留说话人的所有口癖和犹豫感，仅对明显的同音错别字进行修正，并补充基础标点。"),
        ("😊 自媒体/口播", "onestop", "【场景：文案润色】请将这段口语稿转化为适合书面阅读的文章。要求：保留作者的语气风格，去除冗余废话，并在关键观点处加粗，使其更具传播力。"),
        ("🎬 剧本还原", "onestop", "【场景：剧本式记录】请将这段ASR材料转化为剧本格式。格式要求为：[发言人]：“[对话内容]”。请保持对话的原汁原味，仅修正错别字。"),
        ("💬 对白标注", "onestop", "【场景：对话格式化】请将原始文本整理为标准的对白格式。要求：1. 每一段发言必须包含在引号「」或“”内；2. 每一段发言前，请根据上下文推断并标注发言人（如：[张三]）。"),
        ("✍️ 通用处理", "onestop", "【场景：通用优化】修正错别字，优化标点，在不改变原意的前提下，将口语转化为流畅的规范书面语。")
    ]

    for name, key, content in defaults:
        cid = cat_map.get(key)
        if cid:
            cursor.execute(
                "INSERT INTO prompts (name, content, category_id) VALUES (?, ?, ?)",
                (name, content, cid)
            )
