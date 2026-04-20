import base64

from app.api.v1.endpoints.qa import build_messages_for_llm


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1FoAAAAASUVORK5CYII="
)


def _attachment(path, mime_type="image/png"):
    return {
        "id": 1,
        "filename": path.name,
        "file_path": str(path),
        "mime_type": mime_type,
    }


def test_build_messages_for_chat_completions_includes_image_parts(tmp_path):
    image_path = tmp_path / "current.png"
    image_path.write_bytes(PNG_1X1)

    payload = build_messages_for_llm(
        transcript_text="[00:00:00] intro",
        history=[],
        question="What is shown here?",
        current_attachments=[_attachment(image_path)],
        api_type="chat_completions",
    )

    last_message = payload[-1]

    assert last_message["role"] == "user"
    assert last_message["content"][0]["type"] == "text"
    assert last_message["content"][1]["type"] == "image_url"
    assert last_message["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_build_messages_for_chat_completions_keeps_multiple_current_images(tmp_path):
    image_a = tmp_path / "a.png"
    image_b = tmp_path / "b.png"
    image_a.write_bytes(PNG_1X1)
    image_b.write_bytes(PNG_1X1)

    payload = build_messages_for_llm(
        transcript_text="[00:00:00] intro",
        history=[],
        question="Compare these screenshots",
        current_attachments=[_attachment(image_a), _attachment(image_b)],
        api_type="chat_completions",
    )

    last_message = payload[-1]

    assert last_message["role"] == "user"
    assert last_message["content"][0]["type"] == "text"
    assert last_message["content"][1]["type"] == "image_url"
    assert last_message["content"][2]["type"] == "image_url"


def test_build_messages_for_responses_keeps_prior_image_turn(tmp_path):
    prior_image = tmp_path / "prior.png"
    current_image = tmp_path / "current.png"
    prior_image.write_bytes(PNG_1X1)
    current_image.write_bytes(PNG_1X1)

    payload = build_messages_for_llm(
        transcript_text="[00:00:00] intro",
        history=[
            {
                "role": "user",
                "content": "Please inspect this",
                "attachments": [_attachment(prior_image)],
            },
            {
                "role": "assistant",
                "content": "I inspected it.",
                "attachments": [],
            },
        ],
        question="What changed?",
        current_attachments=[_attachment(current_image)],
        api_type="responses",
    )

    assert payload["instructions"]

    user_messages = [message for message in payload["input"] if message["role"] == "user"]

    assert any(
        any(part.get("type") == "input_image" for part in message["content"])
        for message in user_messages
    )
    assert user_messages[-1]["content"][0]["text"] == "What changed?"
    assert user_messages[-1]["content"][1]["image_url"].startswith("data:image/png;base64,")


def test_build_messages_prompt_allows_answering_beyond_transcript_when_needed():
    payload = build_messages_for_llm(
        transcript_text="[00:00:00] 这里只提到一个缩写，没有解释细节",
        history=[],
        question="A.InitialValue 是什么意思？",
        api_type="chat_completions",
    )

    system_prompt = payload[0]["content"]
    transcript_prompt = payload[1]["content"]

    assert "优先依据视频转写内容" in system_prompt
    assert "也可以结合图片内容、常识和通用知识补充回答" in system_prompt
    assert "明确区分哪些内容来自视频材料" in system_prompt
    assert "如果视频材料没有说清楚" in transcript_prompt
