"""Chicken Flock — Home Assistant integration."""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change

from .const import (
    DOMAIN,
    ATTR_CHICKEN_ID, ATTR_NAME, ATTR_BREED, ATTR_SEX,
    ATTR_BIRTHDATE, ATTR_DEATHDATE, ATTR_ACTIVE, ATTR_TRACK_EGGS, ATTR_NOTES,
    SEX_OPTIONS,
    SERVICE_ADD_CHICKEN, SERVICE_UPDATE_CHICKEN,
    SERVICE_REMOVE_CHICKEN, SERVICE_RESET_DAILY_COUNTS,
    SERVICE_IMPORT_MEMBERS, SERVICE_IMPORT_HISTORY,
    SERVICE_DEDUPLICATE, SERVICE_CLEAR_ALL,
    SERVICE_EDIT_HISTORY,
    SERVICE_UPLOAD_PHOTO, SERVICE_DELETE_PHOTO,
    SERVICE_UPLOAD_EGG_PHOTO, SERVICE_DELETE_EGG_PHOTO,
)
from .storage import FlockStore
from .number import EggCounterEntity
from .photo_service import async_save_photo, async_delete_photo

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "number", "button"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Chicken Flock from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    store = FlockStore(hass)
    await store.async_load()

    hass.data[DOMAIN][entry.entry_id] = {
        "store": store,
        "counters": {},
        "add_counter_entities": None,
        "cancel_midnight": None,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _register_services(hass, entry)
    _schedule_midnight_reset(hass, entry)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    data = hass.data[DOMAIN][entry.entry_id]
    if cancel := data.get("cancel_midnight"):
        cancel()

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        _unregister_services(hass)
    return unload_ok


# ---------------------------------------------------------------------------
# Midnight scheduler
# ---------------------------------------------------------------------------

def _schedule_midnight_reset(hass: HomeAssistant, entry: ConfigEntry) -> None:
    async def _midnight_handler(now) -> None:
        from datetime import date, timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        _LOGGER.info("Midnight reset: logging eggs under %s", yesterday)
        await _do_reset(hass, entry, target_date=yesterday)

    cancel = async_track_time_change(hass, _midnight_handler, hour=0, minute=0, second=0)
    hass.data[DOMAIN][entry.entry_id]["cancel_midnight"] = cancel
    _LOGGER.debug("Midnight egg reset scheduled")


# ---------------------------------------------------------------------------
# Shared reset helper
# ---------------------------------------------------------------------------

async def _do_reset(
    hass: HomeAssistant, entry: ConfigEntry, target_date: str | None = None
) -> None:
    """Snapshot counts for target_date and zero all counters.
    Pass target_date for midnight resets (yesterday). Leave None for manual resets (today).
    """
    data = hass.data[DOMAIN][entry.entry_id]
    store: FlockStore = data["store"]
    counters: dict[str, EggCounterEntity] = data["counters"]

    await store.async_reset_all_counts(target_date=target_date)

    for entity in counters.values():
        entity.update_from_store()
        entity.async_write_ha_state()

    _LOGGER.info("Egg counts reset and logged")


# ---------------------------------------------------------------------------
# Dynamic counter entity management
# ---------------------------------------------------------------------------

async def _sync_counter_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
    store: FlockStore,
) -> None:
    data = hass.data[DOMAIN][entry.entry_id]
    counters: dict[str, EggCounterEntity] = data["counters"]
    add_entities = data.get("add_counter_entities")
    ent_reg = er.async_get(hass)
    chickens = store.get_all_chickens()

    to_add = []
    for chicken_id, chicken in chickens.items():
        if store.needs_counter(chicken) and chicken_id not in counters:
            entity = EggCounterEntity(store, chicken_id, chicken)
            counters[chicken_id] = entity
            to_add.append(entity)
            _LOGGER.info("Creating egg counter for '%s'", chicken["name"])

    if to_add and add_entities:
        add_entities(to_add, True)

    for chicken_id in list(counters.keys()):
        chicken = chickens.get(chicken_id)
        if not chicken or not store.needs_counter(chicken):
            entity = counters.pop(chicken_id)
            reg_entry = ent_reg.async_get(entity.entity_id)
            if reg_entry:
                ent_reg.async_remove(entity.entity_id)
            _LOGGER.info("Removed egg counter for chicken %s", chicken_id)


# ---------------------------------------------------------------------------
# Services — all handlers and registrations inside one function
# ---------------------------------------------------------------------------

def _register_services(hass: HomeAssistant, entry: ConfigEntry) -> None:

    async def handle_add_chicken(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        profile = {
            ATTR_NAME: call.data[ATTR_NAME],
            ATTR_BREED: call.data.get(ATTR_BREED),
            ATTR_SEX: call.data.get(ATTR_SEX, "hen"),
            ATTR_BIRTHDATE: call.data.get(ATTR_BIRTHDATE),
            ATTR_DEATHDATE: call.data.get(ATTR_DEATHDATE),
            ATTR_ACTIVE: call.data.get(ATTR_ACTIVE, True),
            ATTR_TRACK_EGGS: call.data.get(ATTR_TRACK_EGGS, True),
            ATTR_NOTES: call.data.get(ATTR_NOTES),
        }
        await store.async_add_chicken(profile)
        await _sync_counter_entities(hass, entry, store)

    async def handle_update_chicken(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        chicken_id = call.data[ATTR_CHICKEN_ID]
        updates = {k: v for k, v in call.data.items() if k != ATTR_CHICKEN_ID}
        await store.async_update_chicken(chicken_id, updates)
        await _sync_counter_entities(hass, entry, store)

    async def handle_remove_chicken(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        chicken_id = call.data[ATTR_CHICKEN_ID]
        await store.async_remove_chicken(chicken_id)
        await _sync_counter_entities(hass, entry, store)

    async def handle_reset_counts(call: ServiceCall) -> None:
        await _do_reset(hass, entry)

    async def handle_import_members(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        rows = call.data.get("rows", [])
        result = await store.async_import_members(rows)
        await _sync_counter_entities(hass, entry, store)
        _LOGGER.info("Import members result: %s", result)

    async def handle_import_history(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        daily_log = call.data.get("daily_log", {})
        result = await store.async_import_history(daily_log)
        _LOGGER.info("Import history result: %s", result)

    async def handle_deduplicate(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        result = await store.async_deduplicate_chickens()
        await _sync_counter_entities(hass, entry, store)
        _LOGGER.info("Deduplicate result: %s", result)

    async def handle_clear_all(call: ServiceCall) -> None:
        data = hass.data[DOMAIN][entry.entry_id]
        store: FlockStore = data["store"]
        counters: dict = data["counters"]
        ent_reg = er.async_get(hass)

        for entity in list(counters.values()):
            reg_entry = ent_reg.async_get(entity.entity_id)
            if reg_entry:
                ent_reg.async_remove(entity.entity_id)
        counters.clear()

        await store.async_clear_all_data()
        _LOGGER.warning("All flock data cleared")

    async def handle_upload_photo(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        chicken_id = call.data["chicken_id"]
        filename   = call.data.get("filename", "photo.jpg")
        data_b64   = call.data["image_data"]
        url = await async_save_photo(hass, chicken_id, filename, data_b64)
        await store.async_update_chicken(chicken_id, {"photo_url": url})
        _LOGGER.info("Photo saved for chicken %s: %s", chicken_id, url)

    async def handle_delete_photo(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        chicken_id = call.data["chicken_id"]
        await async_delete_photo(hass, chicken_id)
        await store.async_update_chicken(chicken_id, {"photo_url": None})
        _LOGGER.info("Photo deleted for chicken %s", chicken_id)

    async def handle_edit_history(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        target_date   = call.data["target_date"]
        chicken_name  = call.data["chicken_name"]
        delta         = int(call.data["delta"])
        result = await store.async_edit_history(target_date, chicken_name, delta)
        _LOGGER.info("History edit result for %s: %s", target_date, result)

    # Register everything
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_CHICKEN, handle_add_chicken,
        schema=vol.Schema({
            vol.Required(ATTR_NAME): str,
            vol.Optional(ATTR_BREED): str,
            vol.Optional(ATTR_SEX, default="hen"): vol.In(SEX_OPTIONS),
            vol.Optional(ATTR_BIRTHDATE): str,
            vol.Optional(ATTR_DEATHDATE): str,
            vol.Optional(ATTR_ACTIVE, default=True): bool,
            vol.Optional(ATTR_TRACK_EGGS, default=True): bool,
            vol.Optional(ATTR_NOTES): str,
        }),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_CHICKEN, handle_update_chicken,
        schema=vol.Schema({
            vol.Required(ATTR_CHICKEN_ID): str,
            vol.Optional(ATTR_NAME): str,
            vol.Optional(ATTR_BREED): str,
            vol.Optional(ATTR_SEX): vol.In(SEX_OPTIONS),
            vol.Optional(ATTR_BIRTHDATE): str,
            vol.Optional(ATTR_DEATHDATE): str,
            vol.Optional(ATTR_ACTIVE): bool,
            vol.Optional(ATTR_TRACK_EGGS): bool,
            vol.Optional(ATTR_NOTES): str,
        }),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REMOVE_CHICKEN, handle_remove_chicken,
        schema=vol.Schema({vol.Required(ATTR_CHICKEN_ID): str}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_RESET_DAILY_COUNTS, handle_reset_counts,
        schema=vol.Schema({}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_IMPORT_MEMBERS, handle_import_members,
        schema=vol.Schema({vol.Required("rows"): list}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_IMPORT_HISTORY, handle_import_history,
        schema=vol.Schema({vol.Required("daily_log"): dict}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_DEDUPLICATE, handle_deduplicate,
        schema=vol.Schema({}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CLEAR_ALL, handle_clear_all,
        schema=vol.Schema({}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_EDIT_HISTORY, handle_edit_history,
        schema=vol.Schema({
            vol.Required("target_date"):   str,
            vol.Required("chicken_name"):  str,
            vol.Required("delta"):         vol.Coerce(int),
        }),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPLOAD_PHOTO, handle_upload_photo,
        schema=vol.Schema({
            vol.Required("chicken_id"): str,
            vol.Required("image_data"): str,
            vol.Optional("filename", default="photo.jpg"): str,
        }),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_PHOTO, handle_delete_photo,
        schema=vol.Schema({vol.Required("chicken_id"): str}),
    )
    async def handle_upload_egg_photo(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        chicken_id = call.data["chicken_id"]
        filename   = call.data.get("filename", "egg.jpg")
        data_b64   = call.data["image_data"]
        url = await async_save_photo(hass, chicken_id, filename, data_b64, suffix="_egg")
        await store.async_update_chicken(chicken_id, {"egg_photo_url": url})
        _LOGGER.info("Egg photo saved for chicken %s: %s", chicken_id, url)

    async def handle_delete_egg_photo(call: ServiceCall) -> None:
        store: FlockStore = hass.data[DOMAIN][entry.entry_id]["store"]
        chicken_id = call.data["chicken_id"]
        await async_delete_photo(hass, chicken_id, suffix="_egg")
        await store.async_update_chicken(chicken_id, {"egg_photo_url": None})
        _LOGGER.info("Egg photo deleted for chicken %s", chicken_id)

    hass.services.async_register(
        DOMAIN, SERVICE_UPLOAD_EGG_PHOTO, handle_upload_egg_photo,
        schema=vol.Schema({
            vol.Required("chicken_id"): str,
            vol.Required("image_data"): str,
            vol.Optional("filename", default="egg.jpg"): str,
        }),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_EGG_PHOTO, handle_delete_egg_photo,
        schema=vol.Schema({vol.Required("chicken_id"): str}),
    )


def _unregister_services(hass: HomeAssistant) -> None:
    for service in [
        SERVICE_ADD_CHICKEN, SERVICE_UPDATE_CHICKEN,
        SERVICE_REMOVE_CHICKEN, SERVICE_RESET_DAILY_COUNTS,
        SERVICE_IMPORT_MEMBERS, SERVICE_IMPORT_HISTORY,
        SERVICE_DEDUPLICATE, SERVICE_CLEAR_ALL,
        SERVICE_EDIT_HISTORY,
        SERVICE_UPLOAD_PHOTO, SERVICE_DELETE_PHOTO,
        SERVICE_UPLOAD_EGG_PHOTO, SERVICE_DELETE_EGG_PHOTO,
    ]:
        hass.services.async_remove(DOMAIN, service)
