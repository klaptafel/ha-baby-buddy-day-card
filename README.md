[![Made for Home Assistant](https://img.shields.io/badge/Made%20for-Home%20Assistant-blue?style=for-the-badge&logo=homeassistant)](https://www.home-assistant.io/)
[![marketplace_badge](https://img.shields.io/badge/Marketplace-Custom-orange.svg?style=for-the-badge)](https://contributors.home-assistant.io/marketplace/)

# Baby Buddy Day Card: Home Assistant Baby Buddy dashboard card

> [!NOTE]
> This card is vibe coded

A 24-hour ring overview of a baby's sleep, feedings, and diaper changes, fed by [Baby
Buddy](https://github.com/babybuddy/babybuddy) data through plain Home Assistant REST sensors: no
direct browser calls to Baby Buddy, so no CORS issues.

## Features

- **Three-ring visualization**: one 24-hour clock face, outer ring for feedings, middle ring for
  sleep, inner ring for diaper changes: sleep as arcs, feedings/changes as small icon dots
  (bottle/apple/heart, and poop/water-drop/diaper icons colored by wet/solid).
- **Day navigation**: step back through previous days with the header arrows; today is always the
  starting point and you can't navigate into the future.
- **Tap for details**: tap any sleep arc, feeding dot, or change dot to see its exact time, duration,
  type, or amount in the center of the ring. Tap it again (or the center text) to go back to the
  day's summary. The gaps between events are tappable too, showing time since the last one.
- **Optional running timer**: shows a live arc + hourglass icon while a Baby Buddy timer (sleep,
  feeding, etc.) is active, if you point it at the right helper entity.
- **Optional average overlay**: a faint "this usually happens around now" ghost layer, based on the
  last N complete days, shown only on today's view.
- Automatically follows your Home Assistant language (English/Dutch) and configured time zone.

## Installation

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=klaptafel&repository=ha-baby-buddy-day-card&category=plugin)

1. Go to the Marketplace in your Home Assistant.
2. Search for "Baby Buddy Day Card" and download it.
3. Set up the three REST sensors it needs (see below), then add the card to a dashboard.

## Configuration

Use the visual editor (pick the three required sensors, the card handles the rest), or YAML:

```yaml
type: custom:baby-buddy-day
sleep_entity: sensor.babybuddy_sleep_raw
feedings_entity: sensor.babybuddy_feedings_raw
changes_entity: sensor.babybuddy_changes_raw
timer_entity: switch.babybuddy_timer   # optional: shows a running timer (hourglass)
average_days: 7                        # optional: faint average-pattern overlay, 0 or omit = off
```

### The underlying REST sensors

The card reads each entity's `results` attribute as a raw array, matching Baby Buddy's own API
response shape directly, so each sensor just needs to expose that array. Example, assuming a
running Baby Buddy instance with API access enabled:

```yaml
rest:
  - resource: "http://<baby-buddy-host>/api/sleep/?child=<child-id>&limit=50"
    headers:
      Authorization: "Token <your-baby-buddy-api-token>"
    sensor:
      - name: "Baby Buddy Sleep Raw"
        value_template: "{{ value_json.count }}"
        json_attributes:
          - results
  - resource: "http://<baby-buddy-host>/api/feedings/?child=<child-id>&limit=50"
    headers:
      Authorization: "Token <your-baby-buddy-api-token>"
    sensor:
      - name: "Baby Buddy Feedings Raw"
        value_template: "{{ value_json.count }}"
        json_attributes:
          - results
  - resource: "http://<baby-buddy-host>/api/changes/?child=<child-id>&limit=50"
    headers:
      Authorization: "Token <your-baby-buddy-api-token>"
    sensor:
      - name: "Baby Buddy Changes Raw"
        value_template: "{{ value_json.count }}"
        json_attributes:
          - results
```

The exact fields the card looks for in each `results` item:

- **Sleep**: `start`, `end` (absent/null while a sleep session is still running), `nap` (true/false).
- **Feedings**: `start`, `type` (e.g. contains "solid"/"formula"/"breast"), `method` (e.g. "left
  breast"/"right breast"/"both breast"/"self fed"/"parent fed"), `amount` (a number, if applicable).
- **Changes**: `time`, `wet`, `solid` (booleans), `color` (one of Baby Buddy's own values,
  `black`/`brown`/`green`/`yellow`, used when `solid` is true).

### Alternative syntax: per-child sensors with a secrets file

The example above uses HA's current, grouped `rest:` syntax. The older, equally valid per-sensor
`platform: rest` syntax under `sensor:` works just as well, and is a natural fit if you're tracking
more than one child (one card instance per child, each pointed at that child's own three sensors):

```yaml
sensor:
  - platform: rest
    name: Child 1 Feedings Raw
    unique_id: child_1_feedings_raw
    resource_template: "http://<baby-buddy-host>:8000/api/feedings/?limit=50&child=1"
    method: GET
    value_template: "{{ value_json.count }}"
    unit_of_measurement: "feedings"
    scan_interval: 60
    json_attributes:
      - results
    headers:
      Authorization: !secret babybuddy_auth
      Accept: "application/json"

  - platform: rest
    name: Child 1 Changes Raw
    unique_id: child_1_changes_raw
    resource_template: "http://<baby-buddy-host>:8000/api/changes/?limit=50&child=1"
    method: GET
    value_template: "{{ value_json.count }}"
    unit_of_measurement: "changes"
    scan_interval: 60
    json_attributes:
      - results
    headers:
      Authorization: !secret babybuddy_auth
      Accept: "application/json"

  - platform: rest
    name: Child 1 Sleep Raw
    unique_id: child_1_sleep_raw
    resource_template: "http://<baby-buddy-host>:8000/api/sleep/?limit=50&child=1"
    method: GET
    value_template: "{{ value_json.count }}"
    unit_of_measurement: "naps"
    scan_interval: 60
    json_attributes:
      - results
    headers:
      Authorization: !secret babybuddy_auth
      Accept: "application/json"
```

For a second child, copy the block again with `child=2` and different `name`/`unique_id` values
(e.g. `Child 2 Feedings Raw`), then add a second card instance pointing at that child's sensors.

**What `!secret babybuddy_auth` does**: it's Home Assistant's built-in way to keep a value like an
API token out of `configuration.yaml` itself. Add a line to `secrets.yaml` (in the same folder as
`configuration.yaml`) with the actual value:

```yaml
# secrets.yaml
babybuddy_auth: "Token abc123yourrealtokenhere"
```

`!secret babybuddy_auth` then reads that value in at startup, so `configuration.yaml` only ever
contains the reference, not the token itself -- useful if you share or version-control that file
without wanting to expose your Baby Buddy credentials. `secrets.yaml` already exists by default in a
standard Home Assistant config folder; just add your own key to it.

If you already use the official [Baby Buddy Marketplace
integration](https://github.com/jcgoette/babybuddy_homeassistant), its own timer helper entities
work directly as `timer_entity` without any extra setup.

## Removal

Delete the card from the dashboard like any other Lovelace card (three-dot menu on the card, or the
dashboard editor), then remove it via the Marketplace if you no longer want it installed at all. Your REST
sensors and Baby Buddy data are unaffected either way.

## Troubleshooting

- **Card shows a missing-entity error banner**: it names exactly which of the three required
  entities is `unavailable`, `unknown`, or missing; double-check that sensor's REST configuration
  and that Baby Buddy is reachable.
- **A ring looks empty even though Baby Buddy has data**: confirm the sensor's `results` attribute is
  really a JSON array (check **Developer tools > States**); if the REST call itself fails or
  returns something unexpected, that ring is simply treated as empty rather than showing an error.
- **The average overlay never shows up**: it only renders on today's view, and only once at least
  one complete previous day's data is available; it never appears on past days you've navigated to.

## Known limitations

- Averages use a simple clustering of event times and don't treat the day as circular: an event at
  23:50 and one at 00:10 are treated as far apart, not adjacent, which can occasionally make a
  late-night pattern look less consistent than it really is.
- Sleep sessions that cross midnight are handled specially; feedings and diaper changes are always
  strictly limited to the calendar day being viewed.
