# QA Image Paste Design

## Goal

Enable DiTing's QA panel to accept pasted Windows screenshots, send them together with the question to multimodal LLMs, and preserve image context across later turns in the same conversation.

## Scope

- Support `Ctrl+V` image paste inside the QA panel.
- Show a local preview before sending and allow removing the pasted image.
- Accept image attachments in `/api/qa/ask`.
- Persist attachment metadata and files so message history can be reloaded.
- Rebuild multimodal history for both `chat_completions` and `responses` providers.

## Out of Scope

- Drag-and-drop uploads
- Multiple pasted images in one message
- OCR or image preprocessing
- Non-image clipboard payloads

## Architecture

### Frontend

`frontend/src/components/QAPanel.tsx` will listen for paste events on the question textarea. When an image blob is detected, it will create a local object URL for preview, store the blob in component state, and submit the question through a multipart request.

### Backend API

`app/api/v1/endpoints/qa.py` will accept either JSON-only text questions or multipart submissions containing `question`, `conversation_id`, optional `llm_model_id`, and one pasted image file. The endpoint will save the user message first, store the attachment on disk, and construct provider-specific multimodal messages for streaming generation.

### Persistence

A new `qa_message_attachments` table will store attachment metadata linked to `qa_messages`. Files will live under `data/qa_attachments/<message_id>/`. Message listing will include attachments so the frontend can render history after refresh.

### LLM Formatting

- `chat_completions` messages will use mixed content arrays with `text` and `image_url`.
- `responses` inputs will be rebuilt from the full QA history using `input_text` and `input_image` items.

This is based on OpenAI's official API reference, which documents image inputs for both the Responses API and Chat Completions API:
- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/api-reference/chat/create

## Error Handling

- Reject empty pasted files.
- Reject unsupported MIME types that are not images.
- Return a normal backend error if the selected model/provider cannot process image input.
- Keep text-only QA behavior unchanged when no attachment is provided.

## Verification

- Add backend tests for attachment-aware history formatting and multipart parsing helpers.
- Run backend tests for the new QA helpers.
- Run frontend build to verify the QA panel compiles with the new multipart flow.
