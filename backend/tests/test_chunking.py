import unittest

from documents.chunking import prepare_chunks, split_text


class ChunkingTests(unittest.TestCase):
    def test_split_text_respects_size_and_keeps_the_opening_content(self):
        text = " ".join(["network"] * 300)
        chunks = split_text(text, chunk_size=120, overlap=20)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 120 for chunk in chunks))
        self.assertTrue(chunks[0].startswith("network network"))

    def test_prepare_chunks_preserves_page_provenance_and_order(self):
        prepared = prepare_chunks([(1, "first page " * 30), (2, "second page " * 30)], chunk_size=100, overlap=10)

        self.assertEqual([chunk.ordinal for chunk in prepared], list(range(len(prepared))))
        self.assertEqual(prepared[0].page_number, 1)
        self.assertEqual(prepared[-1].page_number, 2)


if __name__ == "__main__":
    unittest.main()
