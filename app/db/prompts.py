"""
Prompts Database Operations
CRUD operations for prompts and prompt_categories tables.
"""
from app.db.connection import get_connection, get_connection_with_row


# --- Prompt Operations ---

def get_all_prompts():
    """Get all prompts with category info."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.*, c.name as category_name, c.key as category_key 
        FROM prompts p
        LEFT JOIN prompt_categories c ON p.category_id = c.id
        ORDER BY p.sort_order ASC, p.id ASC
    ''')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_prompt(name, content, category_id):
    """Add a new prompt."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO prompts (name, content, category_id) VALUES (?, ?, ?)", (name, content, category_id))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_prompt(pid, name, content, category_id):
    """Update a prompt."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE prompts SET name=?, content=?, category_id=? WHERE id=?", (name, content, category_id, pid))
    conn.commit()
    conn.close()


def delete_prompt(pid):
    """Delete a prompt."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM prompts WHERE id=?", (pid,))
    conn.commit()
    conn.close()


# --- Category Operations ---

def get_all_categories():
    """Get all prompt categories."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM prompt_categories ORDER BY sort_order ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_category(name, key=None):
    """Add a new prompt category."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO prompt_categories (name, key) VALUES (?, ?)", (name, key))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_category(cid, name):
    """Update a prompt category."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE prompt_categories SET name=? WHERE id=?", (name, cid))
    conn.commit()
    conn.close()


def delete_category(cid, delete_prompts=False):
    """Delete a prompt category, optionally deleting associated prompts."""
    conn = get_connection()
    cursor = conn.cursor()
    
    if delete_prompts:
        cursor.execute("DELETE FROM prompts WHERE category_id = ?", (cid,))
    else:
        cursor.execute("UPDATE prompts SET category_id = NULL WHERE category_id = ?", (cid,))

    cursor.execute("DELETE FROM prompt_categories WHERE id=?", (cid,))
    conn.commit()
    conn.close()
