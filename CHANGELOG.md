# Changelog

## 1.0.0 — First Stable Release

- Fixed connection direction arrows so their visual size and spacing scale with the configured connection-line width on both Google Maps and NAVER Maps.
- Kept the default 3 px appearance unchanged while preventing oversized arrows at extreme custom widths.
- Promoted the release-cleanup baseline to the first stable `1.0.0` release; no data-model or behavioral feature changes were introduced in this final hotfix.

## 0.24.0 — Release Cleanup

- Relaxed account identifiers and passwords for small private deployments: non-empty Unicode IDs and non-empty passwords are accepted, with no UI min/max-length or composition rule.
- Moved product UI copy into locale payload files under `src/i18n/locales/`, while keeping the existing catalog import surface stable.
- Added a per-Trip PLAN B semantic accent color. The default is cool gray `#7D8793`; Timeline-placed schedules continue to use their date color.
- Removed obsolete drag/drop and sidebar-trash CSS left from earlier UI iterations and reduced conflicting sidebar material overrides.
- Moved historical devpack notes out of the project root into `docs/history/`.

## 0.23.0

- Added Snapshot v3 memo/attachment model, image drag-and-drop uploads, attachment lifecycle cleanup, world-pan fixes, itinerary-first initial camera behavior, sidebar drag scrolling, floating map trash target, and a print-aware Capture layout.

Earlier development notes are available under `docs/history/`.
