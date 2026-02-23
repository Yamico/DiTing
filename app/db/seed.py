"""
Database Seed Module
Populates default data for fresh installations.
Each seed function checks for existing data to remain idempotent.
"""
from app.core.logger import logger


def seed_all(cursor):
    """Run all seed operations. Safe to call multiple times."""
    seed_prompt_categories_and_prompts(cursor)
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
        ("💬 对话复盘", "summary", "【场景：对话分析】这是一段多人对话..."),
        ("📝 会议纪要", "summary", "【场景：会议纪要】请根据这段对话/发言..."),
        ("📚 学术/技术讲座", "summary", "【场景：知识提取】重点识别并保护专业术语..."),
        ("🎤 原味观点提炼", "refine", "【场景：原味提炼】请从对话中提炼核心观点..."),
        ("🎤 逐字还原", "refine", "【场景：语言学/心理分析】请严禁剔除任何语气助词..."),
        ("😊 自媒体/口播", "onestop", "【场景：文案润色】请将这段口语稿转化为书面文章..."),
        ("🎬 剧本还原", "onestop", "【场景：剧本式记录】请将ASR材料转化为剧本格式..."),
        ("💬 对白标注", "onestop", "【场景：对话格式化】请将原始文本整理为标准对白..."),
        ("✍️ 通用处理", "onestop", "【场景：通用优化】修正错别字，优化标点...")
    ]

    for name, key, content in defaults:
        cid = cat_map.get(key)
        if cid:
            cursor.execute(
                "INSERT INTO prompts (name, content, category_id) VALUES (?, ?, ?)",
                (name, content, cid)
            )
