# Chicken Flock — Home Assistant Integration

Track your backyard flock and collect egg counts from physical buttons, NFC tags, or dashboard tiles.

---

## Installation

1. Copy the `chicken_flock/` folder into your HA `config/custom_components/` directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & Services → Add Integration** and search for **Chicken Flock**.
4. Click through the one-step setup.

---

## Managing your flock

After setup, go to **Settings → Devices & Services → Chicken Flock → Configure** to:

- **Add a chicken** — enter name, breed, sex, birthdate, and toggle active/track-eggs
- **Edit a chicken** — update any field, including setting a death date or toggling tracking
- **Remove a chicken** — deletes the profile and its counter entity

### Counter entity logic

An entity `counter.flock_<name>_eggs` is **automatically created** whenever a chicken has:
- ✅ Active = on
- ✅ Track eggs = on
- No death date set

The counter is **removed** if any of those conditions change.

---

## Entities created

| Entity | Type | Description |
|---|---|---|
| `counter.flock_<name>_eggs` | Counter | Per-hen egg count (one per tracked hen) |
| `sensor.flock_total_birds` | Sensor | All chickens ever added |
| `sensor.flock_active_hens` | Sensor | Living active hens |
| `sensor.flock_egg_trackers` | Sensor | Hens with tracking enabled |
| `sensor.flock_eggs_today` | Sensor | Sum of all counters today |

---

## Wiring up a button

Any button (Zigbee, Z-Wave, ESPHome, NFC) can increment a counter via an automation:

```yaml
automation:
  - alias: "Henrietta laid an egg"
    trigger:
      - platform: event
        event_type: zha_event
        event_data:
          device_ieee: "aa:bb:cc:dd:ee:ff:00:01"
          command: "toggle"
    action:
      - service: counter.increment
        target:
          entity_id: counter.flock_henrietta_eggs
```

Or use the **Button** helper in the HA UI and assign it to `counter.increment`.

---

## Daily reset automation

Wire the `chicken_flock.reset_daily_counts` service to a time trigger to reset all counts each morning:

```yaml
automation:
  - alias: "Reset egg counts at midnight"
    trigger:
      - platform: time
        at: "00:00:00"
    action:
      - service: chicken_flock.reset_daily_counts
```

---

## Services

| Service | Description |
|---|---|
| `chicken_flock.add_chicken` | Add a chicken programmatically |
| `chicken_flock.update_chicken` | Update a chicken's profile (pass `chicken_id`) |
| `chicken_flock.remove_chicken` | Remove a chicken by `chicken_id` |
| `chicken_flock.reset_daily_counts` | Zero all egg counters |

---

## Dashboard example (Lovelace)

```yaml
type: entities
title: Egg collection today
entities:
  - entity: sensor.flock_eggs_today
  - entity: counter.flock_henrietta_eggs
  - entity: counter.flock_goldie_eggs
  - entity: counter.flock_speckles_eggs
```

Or use **tile** cards with tap-action set to `counter.increment` for a one-tap egg logging dashboard.

---

## Recorder configuration (recommended)

Add the following to your `configuration.yaml` to prevent large service payloads
(photo uploads, bulk history imports) from causing recorder warnings:

```yaml
recorder:
  exclude:
    domains: []
    entity_globs: []
    event_types:
      - call_service
    entities: []
```

**Note:** This excludes ALL service calls from being recorded, which is fine since
HA records entity state changes (not service calls) for history graphs. If you want
to keep service calls recorded but just exclude the large ones, use:

```yaml
recorder:
  exclude:
    event_types: []
    entities:
      - sensor.flock_egg_history
```
