"""Egg counter number entities for individual chickens."""
from __future__ import annotations

import logging
import re
from typing import Any

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DOMAIN
from .storage import FlockStore

_LOGGER = logging.getLogger(__name__)


def chicken_to_slug(name: str) -> str:
    """Convert a chicken name to a safe lowercase slug."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up egg counter number entities for all qualifying chickens."""
    store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
    counters: dict[str, EggCounterEntity] = hass.data[DOMAIN][entry.entry_id]["counters"]

    entities = []
    for chicken_id, chicken in store.get_all_chickens().items():
        if store.needs_counter(chicken) and chicken_id not in counters:
            entity = EggCounterEntity(store, chicken_id, chicken)
            counters[chicken_id] = entity
            entities.append(entity)

    if entities:
        async_add_entities(entities, True)

    # Store callback so __init__ can call it for chickens added at runtime
    hass.data[DOMAIN][entry.entry_id]["add_counter_entities"] = async_add_entities


class EggCounterEntity(NumberEntity, RestoreEntity):
    """A NumberEntity egg counter for a single tracked chicken.

    Using NumberEntity means HA registers it properly with a unique_id,
    making it fully manageable from the UI (rename, disable, etc.).
    """

    _attr_mode = NumberMode.BOX
    _attr_native_min_value = 0
    _attr_native_max_value = 99
    _attr_native_step = 1
    _attr_icon = "mdi:egg"

    def __init__(
        self,
        store: FlockStore,
        chicken_id: str,
        chicken: dict[str, Any],
    ) -> None:
        self._store = store
        self._chicken_id = chicken_id
        self._chicken_name = chicken["name"]
        self._count: float = float(chicken.get("egg_count", 0))

        # Stable UUID-based unique_id — survives renames
        self._attr_unique_id = f"{DOMAIN}_{chicken_id}_eggs"

        # Suggested entity_id — user can override in UI
        self.entity_id = f"number.flock_{chicken_to_slug(self._chicken_name)}_eggs"

    @property
    def name(self) -> str:
        return f"{self._chicken_name} eggs"

    @property
    def native_value(self) -> float:
        return self._count

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        chicken = self._store.get_chicken(self._chicken_id)
        if not chicken:
            return {}
        return {
            "chicken_id": self._chicken_id,
            "breed": chicken.get("breed"),
            "birthdate": chicken.get("birthdate"),
            "sex": chicken.get("sex"),
        }

    async def async_added_to_hass(self) -> None:
        """On HA restart, use storage as the source of truth.

        Storage is written synchronously on every egg count change, so it
        always reflects the correct value — including after a midnight reset.
        We only fall back to HA's recorder state if storage has no record at all
        (e.g. a brand-new entity that was never written to storage yet).
        """
        await super().async_added_to_hass()
        chicken = self._store.get_chicken(self._chicken_id)

        if chicken is not None and "egg_count" in chicken:
            # Storage has the authoritative value — use it, ignore recorder state
            self._count = float(chicken["egg_count"])
            _LOGGER.debug(
                "Loaded egg count from storage for '%s': %d",
                self._chicken_name, int(self._count)
            )
        else:
            # No storage record yet — fall back to recorder restore
            last_state = await self.async_get_last_state()
            if last_state is not None:
                try:
                    restored = float(last_state.state)
                    self._count = restored
                    await self._store.async_update_chicken(
                        self._chicken_id, {"egg_count": int(restored)}
                    )
                    _LOGGER.debug(
                        "Restored egg count from recorder for '%s': %d",
                        self._chicken_name, int(restored)
                    )
                except (ValueError, TypeError):
                    pass

    async def async_set_native_value(self, value: float) -> None:
        """Called when the user sets the value directly in the UI."""
        self._count = value
        await self._store.async_update_chicken(
            self._chicken_id, {"egg_count": int(value)}
        )
        self.async_write_ha_state()

    async def async_increment(self, delta: int = 1) -> None:
        """Increment (or decrement) the counter."""
        new_val = await self._store.async_increment_egg_count(self._chicken_id, delta)
        if new_val is not None:
            self._count = float(new_val)
            self.async_write_ha_state()

    async def async_reset(self) -> None:
        """Reset this counter to zero."""
        await self._store.async_update_chicken(self._chicken_id, {"egg_count": 0})
        self._count = 0.0
        self.async_write_ha_state()

    def update_from_store(self) -> None:
        """Pull latest count from store (used after bulk resets)."""
        chicken = self._store.get_chicken(self._chicken_id)
        if chicken:
            self._count = float(chicken.get("egg_count", 0))
