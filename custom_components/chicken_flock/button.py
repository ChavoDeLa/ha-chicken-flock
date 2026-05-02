"""Button platform — force daily egg count reset."""
from __future__ import annotations

import logging

from homeassistant.components.button import ButtonEntity
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
    async_add_entities([DailyResetButton(hass, entry)], True)


class DailyResetButton(ButtonEntity):
    """Button that triggers an immediate daily egg count reset."""

    _attr_name = "Flock reset daily counts"
    _attr_icon = "mdi:restart"
    _attr_has_entity_name = False

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self._hass = hass
        self._entry = entry
        self._attr_unique_id = f"{DOMAIN}_{entry.entry_id}_reset_button"

    async def async_press(self) -> None:
        """Execute the reset — same logic as the service and midnight scheduler."""
        from . import _do_reset
        await _do_reset(self._hass, self._entry)
        _LOGGER.info("Daily egg reset triggered via button")
