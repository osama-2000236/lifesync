# Ponytail debt ledger

_Frozen: 2026-07-13 · source: live `ponytail:` comments in repo_

One row per marker. Revisit only when the named trigger fires. Do not "pay down" preemptively.

---

## client

### `client/src/utils/speech.js:12`
script regex, not langdetect.
**ceiling:** ar/en
**upgrade:** third language added (widen Unicode ranges)

### `client/src/components/chat/Markdown.jsx:7`
bold / inline code / fences / lists only.
**ceiling:** subset markdown
**upgrade:** react-markdown when headings, tables, or links appear in replies

### `client/src/components/dashboard/CrossDomainTimeline.jsx` (near `dateKey`)
hand-rolled linear scales + straight-segment path (d3 removed — was its only use).
**ceiling:** straight line segments, no curve smoothing
**upgrade:** reinstate d3-shape `curveMonotoneX` if smooth curves are asked for

---

## server

### `server/services/ai/nlpService.js:25`
Arabic-block regex (not langdetect).
**ceiling:** ar/en
**upgrade:** third language added (widen Unicode ranges)

---

## Resolved / demoted (2026-07-13)

- `server/services/ai/conversationService.js:301` — O(n²) re-stringify per trim: marker no longer in source; removed since 2026-07-11 ledger.
- `client/src/components/layout/AppLayout.jsx:115`, `client/src/pages/ProfilePage.jsx:149` — ink-over-navy avatar color: permanent design constraint (navy ramp inverts under `.dark`, white initials fail AA), not deferral. `ponytail:` prefix dropped; comments kept as plain rationale.

---

## Summary

**4 markers · 0 no-trigger.**

Every shortcut has a named revisit condition. Ledger clean.

Regenerate: `/ponytail-debt` — grep `ponytail:` under `client/src` and `server` (skip `node_modules`); note markers can sit mid-line after prose, don't anchor to comment prefix.
