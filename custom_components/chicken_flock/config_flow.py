"""Config flow for Chicken Flock integration."""
from __future__ import annotations

import logging
import voluptuous as vol
from typing import Any

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    ATTR_NAME, ATTR_BREED, ATTR_SEX, ATTR_BIRTHDATE,
    ATTR_DEATHDATE, ATTR_ACTIVE, ATTR_TRACK_EGGS, ATTR_NOTES,
    SEX_OPTIONS,
)

_LOGGER = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Integration-level setup (just creates the entry — no config needed upfront)
# ---------------------------------------------------------------------------

class ChickenFlockConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle initial setup of the integration."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Single-step setup — just confirm and create the entry."""
        # Only allow one instance
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="Chicken Flock", data={})

        return self.async_show_form(
            step_id="user",
            description_placeholders={
                "info": (
                    "This will set up the Chicken Flock integration. "
                    "You can manage your flock from the integration options after setup."
                )
            },
            data_schema=vol.Schema({}),
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> ChickenFlockOptionsFlow:
        return ChickenFlockOptionsFlow(config_entry)


# ---------------------------------------------------------------------------
# Options flow — manage chickens after the integration is set up
# ---------------------------------------------------------------------------

class ChickenFlockOptionsFlow(config_entries.OptionsFlow):
    """Options flow for managing the flock."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry
        self._selected_chicken_id: str | None = None

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Main menu: list chickens and offer actions."""
        from homeassistant.data_entry_flow import FlowResult

        store = self.hass.data[DOMAIN][self._config_entry.entry_id]["store"]
        chickens = store.get_all_chickens()

        if user_input is not None:
            action = user_input.get("action")
            if action == "add":
                return await self.async_step_add_chicken()
            elif action and action.startswith("edit:"):
                self._selected_chicken_id = action.replace("edit:", "")
                return await self.async_step_edit_chicken()
            elif action and action.startswith("remove:"):
                cid = action.replace("remove:", "")
                await store.async_remove_chicken(cid)
                # Re-load manager to destroy the counter entity
                await self.hass.config_entries.async_reload(self._config_entry.entry_id)
                return self.async_create_entry(title="", data={})

        # Build action choices
        choices: dict[str, str] = {"add": "➕  Add a new chicken"}
        for cid, ch in chickens.items():
            status = "✅" if ch.get("active") and not ch.get("deathdate") else "💀" if ch.get("deathdate") else "⏸"
            egg = " 🥚" if store.needs_counter(ch) else ""
            choices[f"edit:{cid}"] = f"{status} {ch['name']} ({ch.get('breed','unknown')}){egg}"
            choices[f"remove:{cid}"] = f"🗑  Remove {ch['name']}"

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required("action"): vol.In(choices)
            }),
        )

    async def async_step_add_chicken(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Form to add a new chicken."""
        errors: dict[str, str] = {}

        if user_input is not None:
            if not user_input.get(ATTR_NAME, "").strip():
                errors[ATTR_NAME] = "Name is required"
            else:
                store = self.hass.data[DOMAIN][self._config_entry.entry_id]["store"]
                profile = _sanitize_profile(user_input)
                chicken_id = await store.async_add_chicken(profile)
                # Reload so counter entity is created if needed
                await self.hass.config_entries.async_reload(self._config_entry.entry_id)
                return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="add_chicken",
            data_schema=_chicken_schema(),
            errors=errors,
        )

    async def async_step_edit_chicken(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Form to edit an existing chicken."""
        errors: dict[str, str] = {}
        store = self.hass.data[DOMAIN][self._config_entry.entry_id]["store"]
        chicken = store.get_chicken(self._selected_chicken_id)

        if chicken is None:
            return await self.async_step_init()

        if user_input is not None:
            if not user_input.get(ATTR_NAME, "").strip():
                errors[ATTR_NAME] = "Name is required"
            else:
                updates = _sanitize_profile(user_input)
                await store.async_update_chicken(self._selected_chicken_id, updates)
                # Reload so counter entities are created/removed as needed
                await self.hass.config_entries.async_reload(self._config_entry.entry_id)
                return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="edit_chicken",
            data_schema=_chicken_schema(chicken),
            errors=errors,
            description_placeholders={"name": chicken.get("name", "")},
        )


def _chicken_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    """Build the voluptuous schema for a chicken profile form."""
    d = defaults or {}
    return vol.Schema({
        vol.Required(ATTR_NAME, default=d.get(ATTR_NAME, "")): str,
        vol.Optional(ATTR_BREED, default=d.get(ATTR_BREED, "")): str,
        vol.Required(ATTR_SEX, default=d.get(ATTR_SEX, "hen")): vol.In(SEX_OPTIONS),
        vol.Optional(ATTR_BIRTHDATE, default=d.get(ATTR_BIRTHDATE, "")): str,
        vol.Optional(ATTR_DEATHDATE, default=d.get(ATTR_DEATHDATE, "")): str,
        vol.Required(ATTR_ACTIVE, default=d.get(ATTR_ACTIVE, True)): bool,
        vol.Required(ATTR_TRACK_EGGS, default=d.get(ATTR_TRACK_EGGS, True)): bool,
        vol.Optional(ATTR_NOTES, default=d.get(ATTR_NOTES, "")): str,
    })


def _sanitize_profile(data: dict[str, Any]) -> dict[str, Any]:
    """Clean up form input before saving."""
    return {
        ATTR_NAME: data[ATTR_NAME].strip(),
        ATTR_BREED: data.get(ATTR_BREED, "").strip() or None,
        ATTR_SEX: data.get(ATTR_SEX, "hen"),
        ATTR_BIRTHDATE: data.get(ATTR_BIRTHDATE, "").strip() or None,
        ATTR_DEATHDATE: data.get(ATTR_DEATHDATE, "").strip() or None,
        ATTR_ACTIVE: bool(data.get(ATTR_ACTIVE, True)),
        ATTR_TRACK_EGGS: bool(data.get(ATTR_TRACK_EGGS, True)),
        ATTR_NOTES: data.get(ATTR_NOTES, "").strip() or None,
    }
