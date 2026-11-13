#!/usr/bin/env python3
"""Validate the project's WebP-only raster policy and referenced asset names."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RAW_RASTER_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif"}
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".txt"}
WEBP_REFERENCE = re.compile(r"[A-Za-z0-9_./-]+\.webp")


def project_files():
    for path in ROOT.rglob("*"):
        relative = path.relative_to(ROOT)
        # Downloadable client/video-production packages are not browser
        # runtime assets and may intentionally contain PNG source frames.
        if ".git" in path.parts or "exports" in relative.parts or "blackout-ridge-act5" in relative.parts or not path.is_file():
            continue
        yield path


def main() -> None:
    files = list(project_files())
    raw = [path for path in files if path.suffix.lower() in RAW_RASTER_SUFFIXES]
    if raw:
        names = "\n".join(str(path.relative_to(ROOT)) for path in raw)
        raise SystemExit(f"Raw raster files remain; convert them to WebP:\n{names}")

    webps = [path for path in files if path.suffix.lower() == ".webp"]
    basenames = {path.name for path in webps}
    for path in webps:
        try:
            with Image.open(path) as image:
                image.load()
                if image.format != "WEBP" or image.width < 1 or image.height < 1:
                    raise ValueError("invalid dimensions or format")
        except Exception as error:
            raise SystemExit(f"Invalid WebP asset {path.relative_to(ROOT)}: {error}") from error

    missing: list[str] = []
    stale: list[str] = []
    for path in files:
        if path.suffix.lower() not in TEXT_SUFFIXES or path.name in {"optimize-project-assets.py", "validate-assets.py"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        asset_references = text.replace(".capture.png", "")
        if re.search(r"\.(?:png|jpe?g|gif)\b", asset_references, re.I):
            stale.append(str(path.relative_to(ROOT)))
        for match in WEBP_REFERENCE.finditer(text):
            reference = match.group(0)
            line_start = text.rfind("\n", 0, match.start()) + 1
            line_end = text.find("\n", match.end())
            source_line = text[line_start : len(text) if line_end < 0 else line_end]
            # Browser regression scripts create WebP screenshots. Those names
            # are output targets, not source assets that must already exist.
            if "writeFileSync" in source_line:
                continue
            if Path(reference).name not in basenames:
                missing.append(f"{path.relative_to(ROOT)} -> {reference}")

    if stale:
        raise SystemExit("Stale non-WebP references remain:\n" + "\n".join(sorted(set(stale))))
    if missing:
        raise SystemExit("Missing WebP references:\n" + "\n".join(sorted(set(missing))))

    total = sum(path.stat().st_size for path in webps)
    print(f"Asset check passed: {len(webps)} WebP files, {total / 1024 / 1024:.1f} MiB, no raw raster files.")


if __name__ == "__main__":
    main()
