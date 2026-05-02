"""Flock-level summary and history sensors."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .storage import FlockStore

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
    async_add_entities([
        FlockRosterSensor(store, entry.entry_id),
        FlockSizeSensor(store, entry.entry_id),
        ActiveHensSensor(store, entry.entry_id),
        EggTrackerCountSensor(store, entry.entry_id),
        TotalEggsTodaySensor(store, entry.entry_id),
        YesterdayEggsSensor(store, entry.entry_id),
        EggHistorySensor(store, entry.entry_id),
    ], True)


class _FlockBase(SensorEntity):
    _attr_should_poll = True

    def __init__(self, store: FlockStore, entry_id: str) -> None:
        self._store = store
        self._entry_id = entry_id

    async def async_update(self) -> None:
        self._compute()

    def _compute(self) -> None:
        raise NotImplementedError


class FlockSizeSensor(_FlockBase):
    _attr_name = "Flock total birds"
    _attr_icon = "mdi:bird"
    _attr_native_unit_of_measurement = "birds"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_total_birds"
        self._attr_native_value = 0

    def _compute(self):
        self._attr_native_value = len(self._store.get_all_chickens())


class ActiveHensSensor(_FlockBase):
    _attr_name = "Flock active hens"
    _attr_icon = "mdi:bird"
    _attr_native_unit_of_measurement = "hens"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_active_hens"
        self._attr_native_value = 0

    def _compute(self):
        self._attr_native_value = sum(
            1 for c in self._store.get_all_chickens().values()
            if c.get("active") and not c.get("deathdate") and c.get("sex") == "hen"
        )


class EggTrackerCountSensor(_FlockBase):
    _attr_name = "Flock egg trackers"
    _attr_icon = "mdi:egg-outline"
    _attr_native_unit_of_measurement = "hens"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_egg_trackers"
        self._attr_native_value = 0

    def _compute(self):
        self._attr_native_value = sum(
            1 for c in self._store.get_all_chickens().values()
            if self._store.needs_counter(c)
        )


class TotalEggsTodaySensor(_FlockBase):
    _attr_name = "Flock eggs today"
    _attr_icon = "mdi:egg"
    _attr_native_unit_of_measurement = "eggs"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_eggs_today"
        self._attr_native_value = 0

    def _compute(self):
        chickens = self._store.get_all_chickens().values()
        self._attr_native_value = sum(
            c.get("egg_count", 0) for c in chickens
            if self._store.needs_counter(c)
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            c["name"]: c.get("egg_count", 0)
            for c in self._store.get_all_chickens().values()
            if self._store.needs_counter(c)
        }


class YesterdayEggsSensor(_FlockBase):
    """Total eggs collected yesterday (populated on daily reset)."""
    _attr_name = "Flock eggs yesterday"
    _attr_icon = "mdi:egg"
    _attr_native_unit_of_measurement = "eggs"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_eggs_yesterday"
        self._attr_native_value = 0

    def _compute(self):
        self._attr_native_value = self._store.get_yesterday_total()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        from datetime import date, timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        log = self._store.get_daily_log()
        return {"date": yesterday, "per_chicken": log.get(yesterday, {})}


class FlockRosterSensor(_FlockBase):
    """Exposes the full chicken roster as attributes so the card can show all birds,
    including inactive ones that have no counter entity."""
    _attr_name = "Flock roster"
    _attr_icon = "mdi:bird"
    _attr_native_unit_of_measurement = "birds"
    _attr_state_class = SensorStateClass.MEASUREMENT
    # Roster attributes can be large; exclude from long-term statistics
    _attr_options = None

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_roster"
        self._attr_native_value = 0
        self._chickens: list[dict[str, Any]] = []

    def _compute(self):
        chickens = self._store.get_all_chickens()
        self._attr_native_value = len(chickens)
        self._chickens = [
            {
                "id":         c["id"],
                "name":       c.get("name", ""),
                "sex":        c.get("sex", "hen"),
                "breed":      c.get("breed"),
                "birthdate":  c.get("birthdate"),
                "deathdate":  c.get("deathdate"),
                "active":     c.get("active", False),
                "track_eggs": c.get("track_eggs", False),
                "notes":      c.get("notes"),
                "photo_url":     c.get("photo_url"),
                "egg_photo_url": c.get("egg_photo_url"),
                "egg_count":  c.get("egg_count", 0),
            }
            for c in chickens.values()
        ]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"chickens": self._chickens}


class EggHistorySensor(_FlockBase):
    """Exposes the full daily egg log as state attributes for the Lovelace card.

    State is a simple count of logged days (not total eggs) to avoid recorder
    unit-mismatch issues. The actual data is in the attributes, read by the card.
    This sensor is excluded from long-term statistics recording.
    """
    _attr_name = "Flock egg history"
    _attr_icon = "mdi:chart-line"
    _attr_native_unit_of_measurement = "days"
    _attr_state_class = None  # exclude from long-term statistics
    _attr_entity_registry_enabled_default = True

    def __init__(self, store, entry_id):
        super().__init__(store, entry_id)
        self._attr_unique_id = f"{DOMAIN}_{entry_id}_egg_history"
        self._attr_native_value = 0
        self._recent: list[dict[str, Any]] = []

    def _compute(self):
        self._recent = self._store.get_recent_daily_totals(9999)  # all history
        self._attr_native_value = len(self._recent)  # count of logged days

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "recent_days": self._recent,
            "chicken_names": [
                c["name"] for c in self._store.get_all_chickens().values()
                if self._store.needs_counter(c)
            ],
        }
