"""
QA conversations and message persistence helpers.
"""
from collections import defaultdict

from app.db.connection import get_connection, get_connection_with_row


def create_conversation(source_id: str, title: str = None, llm_model_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO qa_conversations (source_id, title, llm_model_id) VALUES (?, ?, ?)",
        (source_id, title, llm_model_id),
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_conversations_by_source(source_id: str) -> list:
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM qa_conversations WHERE source_id = ? ORDER BY updated_at DESC",
        (source_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_conversation(conversation_id: int):
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_conversations WHERE id = ?", (conversation_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def update_conversation_title(conversation_id: int, title: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE qa_conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (title, conversation_id),
    )
    conn.commit()
    conn.close()


def touch_conversation(conversation_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE qa_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (conversation_id,),
    )
    conn.commit()
    conn.close()


def delete_conversation(conversation_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM qa_conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()


def delete_conversations_by_source(source_id: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM qa_conversations WHERE source_id = ?", (source_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted


def count_conversations_by_source(source_id: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM qa_conversations WHERE source_id = ?", (source_id,))
    count = cursor.fetchone()[0]
    conn.close()
    return count


def add_message(conversation_id: int, role: str, content: str, model: str = None, response_time: float = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO qa_messages (conversation_id, role, content, model, response_time) VALUES (?, ?, ?, ?, ?)",
        (conversation_id, role, content, model, response_time),
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_messages(conversation_id: int) -> list:
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM qa_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        (conversation_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def _get_attachments_by_message_ids(message_ids: list[int]) -> dict[int, list[dict]]:
    if not message_ids:
        return {}

    conn = get_connection_with_row()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in message_ids)
    cursor.execute(
        f"""
        SELECT *
        FROM qa_message_attachments
        WHERE message_id IN ({placeholders})
        ORDER BY id ASC
        """,
        tuple(message_ids),
    )
    rows = cursor.fetchall()
    conn.close()

    attachments_by_message: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        row_dict = dict(row)
        attachments_by_message[row_dict["message_id"]].append(row_dict)
    return attachments_by_message


def get_messages_with_attachments(conversation_id: int) -> list[dict]:
    rows = get_messages(conversation_id)
    message_ids = [dict(row)["id"] for row in rows]
    attachments_by_message = _get_attachments_by_message_ids(message_ids)

    messages = []
    for row in rows:
        row_dict = dict(row)
        row_dict["attachments"] = attachments_by_message.get(row_dict["id"], [])
        messages.append(row_dict)
    return messages


def get_message(message_id: int):
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_messages WHERE id = ?", (message_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def update_message_content(message_id: int, content: str, model: str = None, response_time: float = None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE qa_messages SET content = ?, model = ?, response_time = ? WHERE id = ?",
        (content, model, response_time, message_id),
    )
    conn.commit()
    conn.close()


def delete_message(message_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM qa_messages WHERE id = ?", (message_id,))
    conn.commit()
    conn.close()


def add_message_attachment(message_id: int, filename: str, file_path: str, mime_type: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO qa_message_attachments (message_id, filename, file_path, mime_type)
        VALUES (?, ?, ?, ?)
        """,
        (message_id, filename, file_path, mime_type),
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_message_attachment(attachment_id: int):
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_message_attachments WHERE id = ?", (attachment_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def get_message_attachments(message_id: int) -> list:
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM qa_message_attachments WHERE message_id = ? ORDER BY id ASC",
        (message_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_attachments_for_conversation(conversation_id: int) -> list:
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT a.*
        FROM qa_message_attachments a
        INNER JOIN qa_messages m ON m.id = a.message_id
        WHERE m.conversation_id = ?
        ORDER BY a.id ASC
        """,
        (conversation_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows
