# QA Multi-Image Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support for attaching up to 4 pasted images to a single QA turn, with frontend preview/removal and backend multi-attachment persistence.

**Architecture:** Extend the existing QA attachment flow from a single-file path to a bounded attachment list. Keep the current `qa_message_attachments` table and multimodal message-building model, but update request parsing, client API, and `QAPanel` state from singular image handling to ordered arrays.

**Tech Stack:** FastAPI, React, TypeScript, TanStack Query, pytest, SQLite

---

## File Map

- Modify: `app/api/v1/endpoints/qa.py` — parse multiple uploads, save multiple attachments, enforce max count, keep multimodal payload order.
- Modify: `frontend/src/api/client.ts` — send multiple `images` files in `FormData`.
- Modify: `frontend/src/components/QAPanel.tsx` — change single-image UI/state to multi-image queue.
- Modify: `frontend/src/translations/zh.json` — add multi-image limit strings.
- Modify: `frontend/src/translations/en.json` — add multi-image limit strings.
- Modify: `tests/test_qa_multimodal.py` — verify multi-image payload construction.
- Modify: `tests/test_qa_attachments.py` — verify multiple attachments round-trip.
- Create: `tests/test_qa_request_parsing.py` — verify multipart parsing and image-count guard.

---

### Task 1: Backend request parsing for multiple images

**Files:**
- Modify: `app/api/v1/endpoints/qa.py`
- Test: `tests/test_qa_request_parsing.py`

- [ ] **Step 1: Write the failing test for parsing multiple `images` files**

```python
import io
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

from app.api.v1.endpoints.qa import _parse_ask_request


def make_multipart_request(form_data):
    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    scope = {
        "type": "http",
        "method": "POST",
        "headers": Headers({"content-type": "multipart/form-data; boundary=test"}).raw,
    }
    request = Request(scope, receive)
    request._form = form_data
    return request
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_qa_request_parsing.py -q`
Expected: FAIL because `_parse_ask_request()` only returns one image payload.

- [ ] **Step 3: Write minimal implementation for multi-image parsing and max-count guard**

```python
MAX_IMAGES_PER_QA_TURN = 4
IMAGE_FIELD_NAME = "images"

uploads = [item for item in form.getlist(IMAGE_FIELD_NAME) if isinstance(item, UploadFile)]
if len(uploads) > MAX_IMAGES_PER_QA_TURN:
    raise HTTPException(400, f"A maximum of {MAX_IMAGES_PER_QA_TURN} images is allowed.")
image_payloads = [await _parse_image_upload(upload) for upload in uploads]
image_payloads = [payload for payload in image_payloads if payload is not None]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_qa_request_parsing.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/endpoints/qa.py tests/test_qa_request_parsing.py
git commit -m "feat: support parsing multiple QA images"
```

### Task 2: Backend persistence and multimodal message construction

**Files:**
- Modify: `app/api/v1/endpoints/qa.py`
- Modify: `tests/test_qa_multimodal.py`
- Modify: `tests/test_qa_attachments.py`

- [ ] **Step 1: Write the failing test for preserving multiple current-turn images in chat payloads**

```python
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

    assert payload[-1]["content"][1]["type"] == "image_url"
    assert payload[-1]["content"][2]["type"] == "image_url"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_qa_multimodal.py::test_build_messages_for_chat_completions_keeps_multiple_current_images -q`
Expected: FAIL if only one image is preserved or ordering is wrong.

- [ ] **Step 3: Write the failing test for storing multiple attachments under one message**

```python
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
    path_a = attachments_dir / "a.png"
    path_b = attachments_dir / "b.png"
    path_a.write_bytes(b"a")
    path_b.write_bytes(b"b")

    add_message_attachment(message_id, "a.png", str(path_a), "image/png")
    add_message_attachment(message_id, "b.png", str(path_b), "image/png")

    messages = get_messages_with_attachments(conversation_id)
    assert len(messages[0]["attachments"]) == 2
```

- [ ] **Step 4: Run test to verify it fails**

Run: `python -m pytest tests/test_qa_attachments.py::test_message_round_trip_includes_multiple_attachment_metadata -q`
Expected: FAIL if returned metadata does not preserve both attachments.

- [ ] **Step 5: Write minimal implementation for multi-attachment save flow**

```python
current_attachments = []
for image_payload in image_payloads:
    current_attachments.append(_save_message_attachment(user_message_id, image_payload))
```

And ensure `build_messages_for_llm()` keeps the full attachment list unchanged for both `chat_completions` and `responses`.

- [ ] **Step 6: Run focused tests**

Run: `python -m pytest tests/test_qa_multimodal.py tests/test_qa_attachments.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/endpoints/qa.py tests/test_qa_multimodal.py tests/test_qa_attachments.py
git commit -m "feat: persist multiple QA attachments"
```

### Task 3: Frontend API client sends multiple images

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Write the failing API contract expectation inline in code change**

```ts
export async function askQuestion(
  conversationId: number,
  question: string,
  llmModelId?: number,
  imageFiles?: File[]
): Promise<{ task_id: number }>
```

- [ ] **Step 2: Run TypeScript build to verify current code fails after signature change**

Run: `cd frontend; npm run build`
Expected: FAIL because existing call sites still pass a single file.

- [ ] **Step 3: Write minimal implementation to append all files under `images`**

```ts
for (const imageFile of imageFiles) {
  form.append('images', imageFile, imageFile.name || 'pasted-image.png')
}
```

- [ ] **Step 4: Run build to verify client compiles**

Run: `cd frontend; npm run build`
Expected: either PASS or fail only at `QAPanel.tsx` until the next task updates callers.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "refactor: allow QA API client to send multiple images"
```

### Task 4: Frontend QAPanel multi-image queue

**Files:**
- Modify: `frontend/src/components/QAPanel.tsx`
- Modify: `frontend/src/translations/zh.json`
- Modify: `frontend/src/translations/en.json`

- [ ] **Step 1: Replace single-image state with array state and limit constant**

```ts
const MAX_PASTED_IMAGES = 4
const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
const pastedImagesRef = useRef<PastedImage[]>([])
```

- [ ] **Step 2: Update paste handling to append multiple images in order**

```ts
const appendPastedImages = (files: File[]) => {
  setPastedImages(prev => {
    const remaining = MAX_PASTED_IMAGES - prev.length
    const accepted = files.slice(0, remaining).map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    return [...prev, ...accepted]
  })
}
```

- [ ] **Step 3: Add per-image remove handler and preview list rendering**

```tsx
{pastedImages.map((image, index) => (
  <div key={image.previewUrl}>
    <img src={image.previewUrl} alt={`attachment-${index + 1}`} />
    <button onClick={() => removePastedImage(image.previewUrl)}>×</button>
  </div>
))}
```

- [ ] **Step 4: Update optimistic message and send flow to use the full array**

```ts
const imageFilesForSend = pastedImages.map(item => item.file)
const optimisticAttachments = pastedImages.map((image, index) => ({
  id: -(Date.now() + index),
  filename: image.file.name || `pasted-image-${index + 1}.png`,
  mime_type: image.file.type || 'image/png',
  url: image.previewUrl,
}))
await askQuestion(convId, question, selectedModelId, imageFilesForSend)
```

- [ ] **Step 5: Add translation strings for multi-image limit and count**

```json
"imageLimit": "最多支持 {{count}} 张图片",
"imageCount": "已附加 {{count}} 张图片"
```

- [ ] **Step 6: Run frontend build**

Run: `cd frontend; npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/QAPanel.tsx frontend/src/api/client.ts frontend/src/translations/zh.json frontend/src/translations/en.json
git commit -m "feat: support multiple pasted images in QA panel"
```

### Task 5: Full verification

**Files:**
- No code changes required unless verification reveals issues.

- [ ] **Step 1: Run backend tests**

Run: `python -m pytest tests -q`
Expected: PASS

- [ ] **Step 2: Run frontend build**

Run: `cd frontend; npm run build`
Expected: PASS

- [ ] **Step 3: Perform a manual smoke test**

Checklist:
1. Open `http://127.0.0.1:5023/app`
2. Enter a video detail page
3. Open QA tab
4. Paste 2 screenshots with `Ctrl+V`
5. Confirm 2 previews appear
6. Remove 1 preview and confirm 1 remains
7. Paste more until 4 total and confirm the limit message appears when exceeding 4
8. Send question and confirm history shows all sent images

Expected: all checklist items succeed.

- [ ] **Step 4: Final commit**

```bash
git add app/api/v1/endpoints/qa.py frontend/src/components/QAPanel.tsx frontend/src/api/client.ts frontend/src/translations/zh.json frontend/src/translations/en.json tests/test_qa_multimodal.py tests/test_qa_attachments.py tests/test_qa_request_parsing.py docs/superpowers/specs/2026-04-20-qa-multi-image-paste-design.md docs/superpowers/plans/2026-04-20-qa-multi-image-paste.md
git commit -m "feat: add multi-image paste support for QA"
```
