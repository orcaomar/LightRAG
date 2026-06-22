import unittest
from unittest.mock import patch

from lightrag.utils_pipeline import get_file_date
from lightrag.operate import _compute_temporal_fields


class TestTemporalFields(unittest.TestCase):

    @patch("lightrag.utils_pipeline.load_metadata_csv")
    def test_get_file_date_fallbacks(self, mock_load_csv):
        mock_load_csv.return_value = {}

        # Test date extraction from filename containing YYMMDD pattern (e.g. 990908.pdf -> 1999-09-08)
        self.assertEqual(get_file_date("minutes/1999/990908.pdf"), "1999-09-08")
        
        # Test date extraction using YYYYMMDD pattern (e.g. 20260621.pdf -> 2026-06-21)
        self.assertEqual(get_file_date("minutes/2026/20260621.pdf"), "2026-06-21")
        
        # Test fallback default or empty
        self.assertEqual(get_file_date("unknown_source"), "")
        self.assertEqual(get_file_date(""), "")

    @patch("lightrag.utils_pipeline.load_metadata_csv")
    def test_get_file_date_csv_lookup(self, mock_load_csv):
        # Mock CSV metadata lookup
        mock_load_csv.return_value = {
            "minutes/1999/909.pdf": {
                "category": "Board Minutes",
                "year_meeting": "1999",
                "title": "September 8, 1999",
                "url": "http://example.com/909.pdf"
            },
            "minutes/1997/71217.pdf": {
                "category": "Board Minutes",
                "year_meeting": "1997",
                "title": "December 17, 1997",
                "url": "http://example.com/71217.pdf"
            }
        }
        
        self.assertEqual(get_file_date("minutes/1999/909.pdf"), "1999-09-08")
        self.assertEqual(get_file_date("/workspace/tdsb_community_hub/archive/minutes/1999/909.pdf"), "1999-09-08")
        
        # Test suffix lookup (passing only the filename)
        self.assertEqual(get_file_date("71217.pdf"), "1997-12-17")
        self.assertEqual(get_file_date("909.pdf"), "1999-09-08")

    @patch("lightrag.utils_pipeline.load_metadata_csv")
    def test_get_file_date_ranges_and_fallbacks(self, mock_load_csv):
        # Test date range title matching (e.g. September 8 and 29, 1999)
        mock_load_csv.return_value = {
            "minutes/1999/909.pdf": {
                "category": "Board Minutes",
                "year_meeting": "1999",
                "title": "September 8 and 29, 1999",
                "url": "http://example.com/909.pdf"
            }
        }
        self.assertEqual(get_file_date("909.pdf"), "1999-09-08")

        # Test fallback 5-digit YYMMDD parsing for 1990s files starting with 7, 8, 9
        mock_load_csv.return_value = {}
        self.assertEqual(get_file_date("71217.pdf"), "1997-12-17")
        self.assertEqual(get_file_date("80128.pdf"), "1998-01-28")

    @patch("lightrag.utils_pipeline.load_metadata_csv")
    def test_compute_temporal_fields(self, mock_load_csv):
        mock_load_csv.return_value = {}
        
        file_path = "minutes/1999/990908.pdf<SEP>minutes/2026/20260621.pdf<SEP>minutes/2005/50921.pdf"
        
        temporal = _compute_temporal_fields(file_path)
        
        self.assertEqual(temporal["first_ref"], "1999-09-08")
        self.assertEqual(temporal["last_ref"], "2026-06-21")
        self.assertIn("2005-09-21", temporal["all_times"])
        self.assertEqual(temporal["all_times"].split("<SEP>"), ["1999-09-08", "2005-09-21", "2026-06-21"])

    def test_compute_temporal_fields_empty(self):
        self.assertEqual(_compute_temporal_fields(""), {"first_ref": "", "last_ref": "", "all_times": ""})
        self.assertEqual(_compute_temporal_fields("unknown_source"), {"first_ref": "", "last_ref": "", "all_times": ""})

    def test_apply_token_truncation_temporal(self):
        import asyncio
        import tiktoken
        from lightrag.operate import _apply_token_truncation
        from lightrag.base import QueryParam
        
        tokenizer = tiktoken.get_encoding("cl100k_base")
        search_result = {
            "final_entities": [
                {
                    "entity_name": "Test Entity",
                    "entity_type": "Person",
                    "description": "A test description",
                    "first_ref": "2020-01-01",
                    "last_ref": "2023-01-01",
                    "created_at": 1600000000,
                    "file_path": "test.pdf"
                }
            ],
            "final_relations": [
                {
                    "src_id": "Entity A",
                    "tgt_id": "Entity B",
                    "description": "Relations desc",
                    "first_ref": "2021-02-02",
                    "last_ref": "2022-02-02",
                    "created_at": 1600000000,
                    "file_path": "test.pdf"
                }
            ]
        }
        query_param = QueryParam(max_entity_tokens=1000, max_relation_tokens=1000)
        global_config = {"tokenizer": tokenizer}
        
        async def run_test():
            return await _apply_token_truncation(search_result, query_param, global_config)
            
        result = asyncio.run(run_test())
        
        self.assertIn("entities_context", result)
        self.assertIn("relations_context", result)
        
        entities_ctx = result["entities_context"]
        self.assertEqual(len(entities_ctx), 1)
        self.assertEqual(entities_ctx[0]["first_referenced"], "2020-01-01")
        self.assertEqual(entities_ctx[0]["last_referenced"], "2023-01-01")
        
        relations_ctx = result["relations_context"]
        self.assertEqual(len(relations_ctx), 1)
        self.assertEqual(relations_ctx[0]["first_referenced"], "2021-02-02")
        self.assertEqual(relations_ctx[0]["last_referenced"], "2022-02-02")

    def test_build_context_str_temporal(self):
        import asyncio
        import tiktoken
        from lightrag.operate import _build_context_str
        from lightrag.base import QueryParam
        
        tokenizer = tiktoken.get_encoding("cl100k_base")
        query_param = QueryParam(max_total_tokens=2048)
        global_config = {"tokenizer": tokenizer}
        
        entities_context = [
            {
                "entity": "Test Entity",
                "type": "Person",
                "description": "A test description",
                "first_referenced": "2020-01-01",
                "last_referenced": "2023-01-01",
                "created_at": "2020-01-01 00:00:00",
                "file_path": "test.pdf"
            }
        ]
        relations_context = []
        merged_chunks = [
            {
                "content": "Test chunk content.",
                "file_path": "test.pdf",
                "chunk_id": "chunk-123",
                "doc_date": "2022-05-05",
            }
        ]
        
        async def run_test():
            return await _build_context_str(
                entities_context=entities_context,
                relations_context=relations_context,
                merged_chunks=merged_chunks,
                query="test query",
                query_param=query_param,
                global_config=global_config
            )
            
        context_str, raw_data = asyncio.run(run_test())
        
        # Check that context_str contains doc_date (as document_date)
        self.assertIn("document_date", context_str)
        self.assertIn("2022-05-05", context_str)
        
        # Check raw_data structured payload
        chunks_data = raw_data["data"]["chunks"]
        self.assertEqual(len(chunks_data), 1)
        self.assertEqual(chunks_data[0]["document_date"], "2022-05-05")


if __name__ == "__main__":
    unittest.main()
