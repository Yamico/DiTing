import asyncio
import base64
import io

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import FormData, Headers
from starlette.requests import Request

from app.api.v1.endpoints.qa import _parse_ask_request


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1FoAAAAASUVORK5CYII="
)


def _upload(name: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(PNG_1X1),
        filename=name,
        headers=Headers({"content-type": "image/png"}),
    )


def _request_with_form(form: FormData) -> Request:
    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "headers": Headers({"content-type": "multipart/form-data; boundary=test"}).raw,
        },
        receive,
    )
    request._form = form
    return request


def test_parse_ask_request_accepts_multiple_images():
    request = _request_with_form(FormData([
        ("conversation_id", "123"),
        ("question", "compare these"),
        ("images", _upload("a.png")),
        ("images", _upload("b.png")),
    ]))

    ask_request, image_payloads = asyncio.run(_parse_ask_request(request))

    assert ask_request.conversation_id == 123
    assert ask_request.question == "compare these"
    assert len(image_payloads) == 2
    assert all(payload["mime_type"] == "image/png" for payload in image_payloads)


def test_parse_ask_request_rejects_more_than_four_images():
    request = _request_with_form(FormData([
        ("conversation_id", "123"),
        ("question", "too many"),
        ("images", _upload("1.png")),
        ("images", _upload("2.png")),
        ("images", _upload("3.png")),
        ("images", _upload("4.png")),
        ("images", _upload("5.png")),
    ]))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_parse_ask_request(request))

    assert exc_info.value.status_code == 400
