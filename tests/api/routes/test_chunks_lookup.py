import importlib
import sys
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

_original_argv = sys.argv[:]
sys.argv = [sys.argv[0]]
_document_routes = importlib.import_module("lightrag.api.routers.document_routes")
sys.argv = _original_argv

create_document_routes = _document_routes.create_document_routes

pytestmark = pytest.mark.offline


class FakeTextChunks:
    def __init__(self, chunks_dict):
        self.chunks_dict = chunks_dict

    async def get_by_ids(self, ids: list[str]) -> list[dict]:
        return [self.chunks_dict.get(cid) for cid in ids]


class FakeDocStatus:
    def __init__(self, doc_status_dict):
        self.doc_status_dict = doc_status_dict

    async def get_by_id(self, doc_id: str) -> dict:
        return self.doc_status_dict.get(doc_id)


class FakeFullDocs:
    def __init__(self, doc_full_dict):
        self.doc_full_dict = doc_full_dict

    async def get_by_id(self, doc_id: str) -> dict:
        return self.doc_full_dict.get(doc_id)


def test_chunks_lookup_comma_separated(monkeypatch):
    # Mock lookup CSV data
    mock_lookup_data = {
        "archive/leadership/meeting_1.pdf": {
            "category": "leadership",
            "year_meeting": "2024",
            "title": "Meeting 1 Title",
            "url": "https://example.com/meeting_1.pdf",
        },
        "archive/leadership/meeting_2.pdf": {
            "category": "leadership",
            "year_meeting": "2024",
            "title": "Meeting 2 Title",
            "url": "https://example.com/meeting_2.pdf",
        }
    }
    monkeypatch.setattr("lightrag.utils_pipeline.load_metadata_csv", lambda: mock_lookup_data)
    monkeypatch.setattr("lightrag.utils_pipeline.sidecar_blocks_path", lambda x: "dummy_blocks.jsonl")
    monkeypatch.setattr("lightrag.utils_pipeline.load_block_page_mapping", lambda x: {"block2": 5})

    chunks_dict = {
        "chunk1": {
            "file_path": "archive/leadership/meeting_1.pdf",
            "original_url": None,
            "page_num": 3,
            "doc_title": "Meeting 1",
            "category": "leadership",
            "content": "This is chunk 1 content.",
        },
        "chunk2": {
            "file_path": "",
            "full_doc_id": "doc2",
            "original_url": None,
            "page_num": None,
            "sidecar": {"id": "some_id", "refs": [{"id": "block2"}]},
            "text": "This is chunk 2 content from text.",
        },
        "chunk3": {
            "file_path": "archive/leadership/meeting_3.pdf",
            "original_url": "https://example.com/direct_3.pdf",
            "page_num": 1,
            "content": "This is chunk 3 content.",
        }
    }
    doc_status_dict = {
        "doc2": {
            "file_path": "archive/leadership/meeting_2.pdf",
            "sidecar_location": "parsed/meeting_2",
        }
    }

    rag = SimpleNamespace(
        text_chunks=FakeTextChunks(chunks_dict),
        doc_status=FakeDocStatus(doc_status_dict),
        full_docs=FakeFullDocs(doc_status_dict),
    )

    app = FastAPI()
    app.include_router(
        create_document_routes(
            rag,
            SimpleNamespace(),
            api_key="test-key",
        )
    )
    client = TestClient(app)
    headers = {"X-API-Key": "test-key"}

    # Test comma-separated lookup
    response = client.get(
        "/documents/chunks/lookup?ids=chunk1,chunk2,chunk3",
        headers=headers,
    )
    assert response.status_code == 200
    res = response.json()
    assert len(res) == 3

    assert res["chunk1"]["original_url"] == "https://example.com/meeting_1.pdf"
    assert res["chunk1"]["page_num"] == 3
    assert res["chunk1"]["content"] == "This is chunk 1 content."

    assert res["chunk2"]["original_url"] == "https://example.com/meeting_2.pdf"
    assert res["chunk2"]["page_num"] == 5
    assert res["chunk2"]["content"] == "This is chunk 2 content from text."

    assert res["chunk3"]["original_url"] == "https://example.com/direct_3.pdf"
    assert res["chunk3"]["page_num"] == 1
    assert res["chunk3"]["content"] == "This is chunk 3 content."


def test_chunks_lookup_sep_separated(monkeypatch):
    mock_lookup_data = {
        "archive/leadership/meeting_1.pdf": {
            "category": "leadership",
            "year_meeting": "2024",
            "title": "Meeting 1 Title",
            "url": "https://example.com/meeting_1.pdf",
        }
    }
    monkeypatch.setattr("lightrag.utils_pipeline.load_metadata_csv", lambda: mock_lookup_data)

    chunks_dict = {
        "chunk1": {
            "file_path": "archive/leadership/meeting_1.pdf",
            "original_url": None,
            "page_num": 3,
            "doc_title": "Meeting 1",
            "category": "leadership",
            "content": "This is chunk 1 content.",
        }
    }

    rag = SimpleNamespace(
        text_chunks=FakeTextChunks(chunks_dict),
        doc_status=FakeDocStatus({}),
        full_docs=FakeFullDocs({}),
    )

    app = FastAPI()
    app.include_router(
        create_document_routes(
            rag,
            SimpleNamespace(),
            api_key="test-key",
        )
    )
    client = TestClient(app)
    headers = {"X-API-Key": "test-key"}

    # Test <SEP>-separated lookup
    response = client.get(
        "/documents/chunks/lookup?ids=chunk1<SEP>chunk1",
        headers=headers,
    )
    assert response.status_code == 200
    res = response.json()
    assert "chunk1" in res
