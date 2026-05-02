"""Storage management for Chicken Flock integration."""
from __future__ import annotations

import uuid
import logging
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)


class FlockStore:
    """Manages persistent storage of chicken flock data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"chickens": {}, "daily_log": {}}

    async def async_load(self) -> None:
        """Load data from storage."""
        stored = await self._store.async_load()
        if stored:
            self._data = stored
            # Migrate: add daily_log if missing from older installs
            self._data.setdefault("daily_log", {})
        else:
            self._data = {"chickens": {}, "daily_log": {}}
        _LOGGER.debug("Loaded flock data: %d chickens", len(self._data["chickens"]))

    async def async_save(self) -> None:
        """Persist data to storage."""
        await self._store.async_save(self._data)

    # ------------------------------------------------------------------
    # Chicken CRUD
    # ------------------------------------------------------------------

    def get_all_chickens(self) -> dict[str, Any]:
        return dict(self._data["chickens"])

    def get_chicken(self, chicken_id: str) -> dict[str, Any] | None:
        return self._data["chickens"].get(chicken_id)

    async def async_add_chicken(self, profile: dict[str, Any]) -> str:
        chicken_id = str(uuid.uuid4())
        self._data["chickens"][chicken_id] = {
            "id": chicken_id,
            **profile,
            "egg_count": 0,
        }
        await self.async_save()
        _LOGGER.info("Added chicken '%s' with id %s", profile.get("name"), chicken_id)
        return chicken_id

    async def async_update_chicken(self, chicken_id: str, updates: dict[str, Any]) -> bool:
        if chicken_id not in self._data["chickens"]:
            return False
        self._data["chickens"][chicken_id].update(updates)
        await self.async_save()
        return True

    async def async_remove_chicken(self, chicken_id: str) -> bool:
        if chicken_id not in self._data["chickens"]:
            return False
        name = self._data["chickens"][chicken_id].get("name", chicken_id)
        del self._data["chickens"][chicken_id]
        await self.async_save()
        _LOGGER.info("Removed chicken '%s' (%s)", name, chicken_id)
        return True

    async def async_increment_egg_count(self, chicken_id: str, delta: int = 1) -> int | None:
        chicken = self._data["chickens"].get(chicken_id)
        if not chicken:
            return None
        new_val = max(0, chicken.get("egg_count", 0) + delta)
        chicken["egg_count"] = new_val
        await self.async_save()
        return new_val

    # ------------------------------------------------------------------
    # Daily log
    # ------------------------------------------------------------------

    async def async_reset_all_counts(self, target_date: str | None = None) -> None:
        """Snapshot counts into the daily log for target_date, then zero counters.

        target_date should be the date the eggs were COLLECTED, not the date the
        reset fires. For the midnight auto-reset, pass yesterday's date. For manual
        resets triggered during the day, pass today's date (the default).

        If an entry for target_date already exists, counts are merged in (added).
        """
        log_date = target_date or date.today().isoformat()
        existing = self._data["daily_log"].get(log_date, {})

        snapshot: dict[str, int] = dict(existing)  # start from existing entry
        any_new = False
        for chicken in self._data["chickens"].values():
            if self.needs_counter(chicken):
                live = chicken.get("egg_count", 0)
                if live > 0:
                    name = chicken["name"]
                    snapshot[name] = snapshot.get(name, 0) + live
                    any_new = True

        if snapshot:
            self._data["daily_log"][log_date] = snapshot
            if any_new:
                _LOGGER.info("Egg counts merged for %s: %s", log_date, snapshot)
            else:
                _LOGGER.info("Reset for %s — no new counts to merge", log_date)
        else:
            _LOGGER.info("Reset for %s — no tracked hens with counts", log_date)

        # Zero all counters regardless
        for chicken in self._data["chickens"].values():
            chicken["egg_count"] = 0

        # History is kept indefinitely — no trim
        await self.async_save()

    def get_daily_log(self) -> dict[str, dict[str, int]]:
        """Return the full daily log: {date_str: {chicken_name: count}}."""
        return dict(self._data["daily_log"])

    def get_yesterday_total(self) -> int:
        """Return the total eggs logged yesterday, or 0 if no entry."""
        from datetime import timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        entry = self._data["daily_log"].get(yesterday, {})
        return sum(entry.values())

    def get_recent_daily_totals(self, days: int = 9999) -> list[dict[str, Any]]:
        """Return a list of {date, total} dicts for the last N logged days."""
        log = self._data["daily_log"]
        sorted_dates = sorted(log.keys())[-days:]
        return [
            {"date": d, "total": sum(log[d].values()), "per_chicken": log[d]}
            for d in sorted_dates
        ]

    # ------------------------------------------------------------------
    # CSV import
    # ------------------------------------------------------------------

    async def async_clear_all_data(self) -> None:
        """Wipe all chickens and history. Irreversible."""
        self._data = {"chickens": {}, "daily_log": {}}
        await self.async_save()
        _LOGGER.warning("All flock data has been cleared")

    async def async_deduplicate_chickens(self) -> dict[str, Any]:
        """Remove duplicate chicken entries, keeping the one with the most data.

        "Most data" is defined as: has a birthdate > has notes > was added first.
        Returns counts of removed duplicates.
        """
        seen: dict[str, str] = {}   # name.lower() -> chicken_id to keep
        to_remove = []

        # Sort by id so earlier-added birds are processed first
        for chicken_id, chicken in sorted(self._data["chickens"].items(), key=lambda x: x[0]):
            name_key = chicken.get("name", "").strip().lower()
            if not name_key:
                continue
            if name_key not in seen:
                seen[name_key] = chicken_id
            else:
                # Keep whichever has more data; prefer the existing keeper
                keeper_id = seen[name_key]
                keeper = self._data["chickens"][keeper_id]
                challenger = chicken
                # Score: birthdate=2, notes=1
                keeper_score = (2 if keeper.get("birthdate") else 0) + (1 if keeper.get("notes") else 0)
                chall_score  = (2 if challenger.get("birthdate") else 0) + (1 if challenger.get("notes") else 0)
                if chall_score > keeper_score:
                    to_remove.append(keeper_id)
                    seen[name_key] = chicken_id
                else:
                    to_remove.append(chicken_id)

        for rid in to_remove:
            name = self._data["chickens"][rid].get("name", rid)
            del self._data["chickens"][rid]
            _LOGGER.info("Dedup: removed duplicate '%s' (%s)", name, rid)

        if to_remove:
            await self.async_save()

        _LOGGER.info("Deduplication complete: %d duplicates removed", len(to_remove))
        return {"removed": len(to_remove)}

    async def async_import_members(
        self, rows: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Import chicken profiles from parsed CSV rows.

        Each row should have keys: name, sex, breed, birthdate, active,
        track_eggs, notes.  Existing chickens with the same name are skipped.
        Returns a result dict with counts of added/skipped.
        """
        existing_names = {
            c["name"].strip().lower()
            for c in self._data["chickens"].values()
        }
        added, skipped = 0, 0
        for row in rows:
            name = (row.get("name") or "").strip()
            if not name:
                skipped += 1
                continue
            if name.lower() in existing_names:
                _LOGGER.info("Import: skipping duplicate chicken '%s'", name)
                skipped += 1
                continue
            chicken_id = str(uuid.uuid4())
            self._data["chickens"][chicken_id] = {
                "id": chicken_id,
                "name": name,
                "breed": row.get("breed") or None,
                "sex": row.get("sex", "hen"),
                "birthdate": row.get("birthdate") or None,
                "deathdate": row.get("deathdate") or None,
                "active": bool(row.get("active", True)),
                "track_eggs": bool(row.get("track_eggs", True)),
                "notes": row.get("notes") or None,
                "egg_count": 0,
                "photo_url": None,
                "egg_photo_url": None,
            }
            existing_names.add(name.lower())
            added += 1

        await self.async_save()
        _LOGGER.info("Member import: %d added, %d skipped", added, skipped)
        return {"added": added, "skipped": skipped}

    async def async_edit_history(
        self,
        target_date: str,
        chicken_name: str,
        delta: int,
    ) -> dict:
        """Add or adjust an egg count for a specific hen on a specific past date.

        If the date doesn't exist in the log, it is created.
        If the hen doesn't exist on that date, she is added with max(0, delta).
        If she does exist, her count is adjusted by delta (floored at 0).
        Returns the updated day entry.
        """
        log = self._data["daily_log"]
        day = log.get(target_date, {})
        current = day.get(chicken_name, 0)
        new_count = max(0, current + delta)

        if new_count == 0 and chicken_name not in day:
            # Nothing to do — adding 0 for a hen not in this day
            return dict(day)

        day[chicken_name] = new_count
        log[target_date] = day

        # Clean up zero entries to keep the log tidy
        if new_count == 0:
            del day[chicken_name]
            if not day:
                del log[target_date]

        await self.async_save()
        _LOGGER.info(
            "History edit: %s on %s — %+d (was %d, now %d)",
            chicken_name, target_date, delta, current, new_count
        )
        return dict(log.get(target_date, {}))

    async def async_import_history(
        self, daily_log: dict[str, dict[str, int]]
    ) -> dict[str, Any]:
        """Merge an imported daily log into the existing log.

        daily_log format: {iso_date_str: {hen_name: egg_count}}
        Existing dates are merged (counts added), not overwritten.
        New dates are inserted directly.
        Returns result dict with counts of dates merged/added.
        """
        merged, inserted = 0, 0
        for date_str, counts in daily_log.items():
            if date_str in self._data["daily_log"]:
                # Merge: add imported counts to any existing counts for that day
                existing = self._data["daily_log"][date_str]
                for name, count in counts.items():
                    existing[name] = existing.get(name, 0) + count
                merged += 1
            else:
                self._data["daily_log"][date_str] = dict(counts)
                inserted += 1

        await self.async_save()
        _LOGGER.info(
            "History import: %d dates inserted, %d dates merged", inserted, merged
        )
        return {"inserted": inserted, "merged": merged, "total": inserted + merged}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def needs_counter(self, chicken: dict[str, Any]) -> bool:
        return (
            chicken.get("active", False)
            and chicken.get("track_eggs", False)
            and not chicken.get("deathdate")
        )
