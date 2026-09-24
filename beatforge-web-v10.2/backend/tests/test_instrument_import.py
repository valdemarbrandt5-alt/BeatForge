"""Keep local instrument imports resumable without replacing full-mix charts."""

import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import import_youtube_charts as importer


class InstrumentImportTest(unittest.TestCase):
    def test_rerun_adds_only_missing_instruments(self):
        with TemporaryDirectory() as tmp:
            links = Path(tmp) / "links.txt"
            links.write_text("https://music.youtube.com/watch?v=TAZkHYyio-M\n")
            rows = [{"id": "existing", "instrument": "mix"}]
            posts = []

            def fake_request(_base, _key, route, method="GET", payload=None):
                if route.startswith("profiles?"):
                    return [{"id": "admin"}]
                if route.startswith("charts?select="):
                    return list(rows)
                self.assertEqual((route, method), ("charts", "POST"))
                posts.append(payload)
                rows.append({"id": str(len(posts)), "instrument": payload.get("instrument", "mix")})

            notes = [{"id": n, "time": float(n), "lane": n % 5} for n in range(5)]
            env = {
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_example",
                "BEATFORGE_ADMIN_USER_ID": "1f7c311c-227e-4bea-8791-5dcb32f8c953",
            }
            with (patch.dict(os.environ, env),
                  patch.object(sys, "argv", ["import_youtube_charts.py", str(links), "--instruments", "all"]),
                  patch.object(importer, "request_json", side_effect=fake_request),
                  patch.object(importer, "youtube_metadata", return_value={"title": "Song", "artist": "Artist"}) as metadata,
                  patch.object(importer, "download_audio", side_effect=lambda _url, directory: directory / "song.wav") as download,
                  patch.object(importer, "generate_stem_charts", return_value={key: (notes, 120.0) for key in ("vocals", "drums", "bass", "melody")}) as separate,
                  patch.object(importer, "generate_chart") as mix,
                  patch.object(importer.shutil, "which", return_value="ffmpeg"),
                  patch("importlib.util.find_spec", return_value=object())):
                importer.main()
                importer.main()

            self.assertEqual({row["instrument"] for row in posts}, {"vocals", "drums", "bass", "melody"})
            self.assertEqual(len({row["youtube_url"] for row in posts}), 1)
            self.assertEqual(metadata.call_count, 1)
            self.assertEqual(download.call_count, 1)
            separate.assert_called_once()
            mix.assert_not_called()


if __name__ == "__main__":
    unittest.main()
