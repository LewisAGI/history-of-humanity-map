"""Regenerate data/events.json from the authoring modules.

The app and the tests read data/events.json. Run this from the repo root after editing the modules.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import EVENTS  # noqa: E402
import africa  # noqa: F401, E402
import asia  # noqa: F401, E402
import europe  # noqa: F401, E402
import americas  # noqa: F401, E402
import oceania  # noqa: F401, E402

out = Path(__file__).resolve().parents[1] / "data" / "events.json"
out.write_text(json.dumps(EVENTS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {len(EVENTS)} events to {out}")
