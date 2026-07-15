# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/). This project has no GitHub release yet: everything below ships as the initial 1.0.0.

## [Unreleased]

This is the card's first proper release: it now shows up correctly in the card picker and installs/updates cleanly through HACS, and has a visual editor instead of being YAML-only. Also one error message (shown when required config is missing) now appearing in English instead of Dutch.

### Added
- Visual editor: pick the three required sensors (plus the optional timer helper and average-overlay days) via `ha-form`, instead of hand-writing YAML.
- `window.customCards.push` completed with `preview`, `documentationURL`, and `version` (was missing all three).
- Missing `hacs.json`.
- GitHub Actions (`validate.yml`) and `dependabot.yml`: this project had none before.
- A full README (previously just the repo name): Features, Installation, Configuration (including an example REST sensor setup for Baby Buddy's API, since the header comment's referenced example file never actually existed in this repo), an alternative per-child REST sensor example using the older `platform: rest` syntax and `!secret`, Removal, Troubleshooting, and Known limitations.

### Changed
- All code comments and docstrings translated from Dutch to English (base language); the UI-facing `STRINGS.en`/`STRINGS.nl` dict is untouched, it was already correctly bilingual. Along the way, fixed a duplicated comment block in the ring-geometry code and dropped a stale `Versie: 0.1.1` line from the header docstring that had drifted out of sync with `CARD_VERSION`.
- The `setConfig` error message ("... is verplicht in de config") translated to English, matching the code-language standard.
- `customElements.define` now guarded against double-registration.
- The card-picker `description` translated from Dutch to English (base language, matching the other cards' `customCards.push` metadata).

### Known gaps (tracked, not yet addressed)
- No GUI editor: configuration is YAML-only.
