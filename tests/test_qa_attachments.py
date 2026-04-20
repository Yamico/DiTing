import os
import sqlite3

from app.core.config import settings
from app.db import schema as db_schema
from app.db.qa import add_message, add_message_attachment, create_conversation, get_messages_with_attachments


def test_message_round_trip_includes_attachment_metadata(tmp_path, monkeypatch):
    db_path = tmp_path / "qa-test.db"
    attachments_dir = tmp_path / "qa_attachments"
    attachments_dir.mkdir()

    monkeypatch.setattr(settings, "DB_PATH", str(db_path))
    monkeypatch.setattr(settings, "QA_ATTACHMENTS_DIR", str(attachments_dir))

    conn = sqlite3.connect(settings.DB_PATH)
    cursor = conn.cursor()
    db_schema.create_all(cursor)
    conn.commit()
    conn.close()

    conversation_id = create_conversation("source-1")
    message_id = add_message(conversation_id, "user", "look at this screenshot")
    image_path = attachments_dir / "clip.png"
    image_path.write_bytes(b"png")

    add_message_attachment(
        message_id,
        "clip.png",
        str(image_path),
        "image/png",
    )

    messages = get_messages_with_attachments(conversation_id)

    assert len(messages) == 1
    assert messages[0]["attachments"][0]["filename"] == "clip.png"
    assert messages[0]["attachments"][0]["mime_type"] == "image/png"
    assert os.path.normpath(messages[0]["attachments"][0]["file_path"]) == os.path.normpath(str(image_path))


def test_message_round_trip_includes_multiple_attachment_metadata(tmp_path, monkeypatch):
    db_path = tmp_path / "qa-test.db"
    attachments_dir = tmp_path / "qa_attachments"
    attachments_dir.mkdir()

    monkeypatch.setattr(settings, "DB_PATH", str(db_path))
    monkeypatch.setattr(settings, "QA_ATTACHMENTS_DIR", str(attachments_dir))

    conn = sqlite3.connect(settings.DB_PATH)
    cursor = conn.cursor()
    db_schema.create_all(cursor)
    conn.commit()
    conn.close()

    conversation_id = create_conversation("source-1")
    message_id = add_message(conversation_id, "user", "compare these")
    image_a = attachments_dir / "a.png"
    image_b = attachments_dir / "b.png"
    image_a.write_bytes(b"a")
    image_b.write_bytes(b"b")

    add_message_attachment(message_id, "a.png", str(image_a), "image/png")
    add_message_attachment(message_id, "b.png", str(image_b), "image/png")

    messages = get_messages_with_attachments(conversation_id)

    assert len(messages) == 1
    assert len(messages[0]["attachments"]) == 2
    assert [attachment["filename"] for attachment in messages[0]["attachments"]] == ["a.png", "b.png"]
