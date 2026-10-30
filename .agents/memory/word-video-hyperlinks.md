---
name: Word video hyperlink pitfalls
description: Why a successful activity import can still retain an old YouTube video.
---

Treat the visible corrected YouTube URL as authoritative when a Word hyperlink still targets an older YouTube URL. Normalize nested video anchors before browser HTML parsing.

**Why:** An uploaded activity document visibly contained the corrected Parallel Row video but retained an outer hyperlink to the Quad Band Pull Apart video. Mammoth emitted nested anchors; browser parsing can split them into separate links, and subsequent URL-to-embed conversion can preserve the stale video even though the activity update succeeds.

**How to apply:** When investigating a successful import with incorrect videos, inspect raw Mammoth HTML, not only extracted text or the final saved embeds. Preserve other exercises and non-video links; test nested anchors and differing display/destination URLs.
