"""Photo upload service for Chicken Flock."""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PHOTO_DIR = "www/flock_photos"
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _safe_filename(chicken_id: str, original_name: str, suffix: str = "") -> str:
    """Return a safe filename: <chicken_id>[_suffix].<ext>"""
    ext = Path(original_name).suffix.lower().lstrip(".")
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    return f"{chicken_id}{suffix}.{ext}"


async def async_save_photo(
    hass: HomeAssistant,
    chicken_id: str,
    filename: str,
    data_b64: str,
    suffix: str = "",
) -> str:
    """Decode base64 image, validate, write to www/flock_photos/, return URL path."""

    # Decode
    try:
        image_bytes = base64.b64decode(data_b64)
    except Exception as err:
        raise ValueError(f"Invalid base64 data: {err}") from err

    if len(image_bytes) > MAX_SIZE_BYTES:
        raise ValueError(f"Image too large ({len(image_bytes)} bytes, max {MAX_SIZE_BYTES})")

    # Validate it's actually an image using magic bytes (imghdr removed in Python 3.13)
    def _sniff(b: bytes) -> bool:
        sigs = [
            b"\xff\xd8\xff",           # JPEG
            b"\x89PNG\r\n\x1a\n",    # PNG
            b"GIF87a", b"GIF89a",         # GIF
            b"RIFF",                       # WEBP (RIFF....WEBP)
        ]
        return any(b.startswith(s) for s in sigs) or b[8:12] == b"WEBP"

    if not _sniff(image_bytes):
        raise ValueError("Uploaded file does not appear to be a valid image")

    # Build destination path
    photo_dir = Path(hass.config.config_dir) / PHOTO_DIR
    safe_name = _safe_filename(chicken_id, filename, suffix)
    dest = photo_dir / safe_name

    # Write async via executor so we don't block the event loop
    def _write():
        photo_dir.mkdir(parents=True, exist_ok=True)
        # Remove any existing photo for this chicken with same suffix (different extension)
        pattern = f"{chicken_id}{suffix}.*"
        for old in photo_dir.glob(pattern):
            old.unlink(missing_ok=True)
        dest.write_bytes(image_bytes)
        _LOGGER.info("Saved flock photo: %s (%d bytes)", dest, len(image_bytes))

    await hass.async_add_executor_job(_write)

    # Return the URL path HA will serve it at
    return f"/local/flock_photos/{safe_name}"


async def async_delete_photo(
    hass: HomeAssistant, chicken_id: str, suffix: str = ""
) -> None:
    """Remove any photo files for the given chicken (optionally by suffix)."""
    photo_dir = Path(hass.config.config_dir) / PHOTO_DIR

    def _delete():
        for f in photo_dir.glob(f"{chicken_id}{suffix}.*"):
            f.unlink(missing_ok=True)
            _LOGGER.info("Deleted flock photo%s for chicken %s", suffix, chicken_id)

    await hass.async_add_executor_job(_delete)
