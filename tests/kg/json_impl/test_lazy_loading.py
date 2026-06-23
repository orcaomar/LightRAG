import pytest
import os
from unittest.mock import patch

from lightrag.kg.json_kv_impl import JsonKVStorage
from lightrag.kg.shared_storage import (
    finalize_share_data,
    initialize_share_data,
    is_namespace_loaded,
)
from lightrag.namespace import NameSpace
from lightrag.utils import write_json, load_json

pytestmark = pytest.mark.offline


class _DummyEmbeddingFunc:
    embedding_dim = 1
    max_token_size = 1

    async def __call__(self, texts, **kwargs):
        return [[0.0] for _ in texts]


@pytest.fixture(autouse=True)
def setup_shared_data():
    initialize_share_data()
    yield
    finalize_share_data()


@pytest.mark.asyncio
async def test_lazy_loading_defers_and_loads_on_demand(tmp_path):
    # Pre-populate a KV store JSON file on disk
    workspace = "test_lazy"
    os.makedirs(tmp_path / workspace, exist_ok=True)
    file_name = tmp_path / workspace / "kv_store_text_chunks.json"
    
    initial_data = {
        "chunk-1": {
            "content": "lazy chunk content",
            "tokens": 3,
            "chunk_order_index": 0,
            "full_doc_id": "doc-1",
        }
    }
    write_json(initial_data, str(file_name))

    # Create JsonKVStorage
    storage = JsonKVStorage(
        namespace=NameSpace.KV_STORE_TEXT_CHUNKS,
        global_config={"working_dir": str(tmp_path)},
        embedding_func=_DummyEmbeddingFunc(),
        workspace=workspace,
    )

    # Patch load_json to trace when it is called
    with patch("lightrag.kg.json_kv_impl.load_json", wraps=load_json) as mock_load:
        # Initialize should NOT call load_json
        await storage.initialize()
        mock_load.assert_not_called()
        assert not await is_namespace_loaded(storage.namespace, workspace=workspace)

        # Call get_by_id - this should trigger load_json
        result = await storage.get_by_id("chunk-1")
        mock_load.assert_called_once()
        assert await is_namespace_loaded(storage.namespace, workspace=workspace)
        assert result is not None
        assert result["content"] == "lazy chunk content"

        # Subsequent reads should NOT call load_json again
        result2 = await storage.get_by_id("chunk-1")
        mock_load.assert_called_once()  # Still only once
        assert result2["content"] == "lazy chunk content"
