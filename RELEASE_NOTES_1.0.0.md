# TripPlanner 1.0.0

First stable release.

## Final hotfix

- Connection direction arrows now scale with the configured connection-line width on Google Maps and NAVER Maps.
- The default 3 px appearance remains unchanged.
- Arrow spacing and outline/anchor metrics scale with the glyph so thicker lines remain readable.
- Hover/selection-only line boosts do not resize the arrow; only the saved base connection width controls arrow size.

## Validation

- Full regression suite: 172 / 172 PASS
- TypeScript/TSX no-check project validation: PASS
- Server/scripts/tests JavaScript syntax check: 33 / 33 PASS

No Snapshot or database migration was introduced by this final hotfix.
