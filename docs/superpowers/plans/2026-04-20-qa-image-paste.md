# QA Image Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pasted-image support to DiTing QA so Windows screenshots can be sent with a question and preserved in conversation history.

**Architecture:** The backend will persist QA attachment metadata in SQLite and files on disk, then rebuild provider-specific multimodal request bodies from stored history. The frontend will detect pasted images in `QAPanel`, preview them locally, and submit the message as multipart form data while leaving text-only behavior unchanged.

**Tech Stack:** FastAPI, SQLite, React 18, TypeScript, Vite, OpenAI-compatible SDK

---

### Task 1: Persist QA attachments

**Files:**
- Modify: `app/core/config.py`
- Modify: `app/db/schema.py`
- Modify: `app/db/migrations.py`
- Modify: `app/db/qa.py`
- Create: `app/api/v1/endpoints/qa_attachments.py`
- Test: `tests/test_qa_attachments.py`

- [ ] **Step 1: Write the failing test**

```python
def test_message_round_trip_includes_attachment_metadata(tmp_path, monkeypatch):
    ...
    assert messages[0]["attachments"][0]["mime_type"] == "image/png"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_qa_attachments.py::test_message_round_trip_includes_attachment_metadata -q`
Expected: FAIL because attachment table helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
cursor.execute(
    """
    CREATE TABLE IF NOT EXISTS qa_message_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES qa_messages (id) ON DELETE CASCADE
    )
    """
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_qa_attachments.py::test_message_round_trip_includes_attachment_metadata -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/core/config.py app/db/schema.py app/db/migrations.py app/db/qa.py app/api/v1/endpoints/qa_attachments.py tests/test_qa_attachments.py
git commit -m "feat: persist qa image attachments"
```

### Task 2: Build multimodal QA messages

**Files:**
- Modify: `app/api/v1/endpoints/qa.py`
- Modify: `app/services/llm.py`
- Test: `tests/test_qa_multimodal.py`

- [ ] **Step 1: Write the failing test**

```python
def test_build_responses_input_keeps_prior_image_turn():
    messages = build_provider_messages(
        api_type="responses",
        transcript_text="[00:00:00] intro",
        history=[{"role": "user", "content": "look", "attachments": [{"url": "/api/qa/attachments/1"}]}],
        question="what is shown?",
        current_attachments=[{"url": "/api/qa/attachments/2"}],
    )
    assert messages[1]["content"][1]["type"] == "input_image"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_qa_multimodal.py::test_build_responses_input_keeps_prior_image_turn -q`
Expected: FAIL because the provider-specific formatter does not support multimodal history.

- [ ] **Step 3: Write minimal implementation**

```python
if api_type == "responses":
    return [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": text_part},
                {"type": "input_image", "image_url": image_url},
            ],
        }
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_qa_multimodal.py::test_build_responses_input_keeps_prior_image_turn -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/endpoints/qa.py app/services/llm.py tests/test_qa_multimodal.py
git commit -m "feat: build multimodal qa history"
```

### Task 3: Add paste-and-preview UI

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/components/QAPanel.tsx`
- Modify: `frontend/src/translations/zh.json`
- Modify: `frontend/src/translations/en.json`

- [ ] **Step 1: Write the failing test or compile check target**

```tsx
// Expected behavior:
// 1. Paste image blob into textarea
// 2. Preview card appears
// 3. askQuestion sends FormData with file
```

- [ ] **Step 2: Run compile/build to verify it fails**

Run: `npm run build`
Expected: FAIL until the new attachment-aware types and submit flow are wired together.

- [ ] **Step 3: Write minimal implementation**

```tsx
const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
  const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith("image/"))
  if (!imageItem) return
  const file = imageItem.getAsFile()
  if (!file) return
  setPastedImage({ file, previewUrl: URL.createObjectURL(file) })
  event.preventDefault()
}
```

- [ ] **Step 4: Run build to verify it passes**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/components/QAPanel.tsx frontend/src/translations/zh.json frontend/src/translations/en.json
git commit -m "feat: add qa image paste ui"
```
