# Ponytail debt ledger

_Frozen: 2026-07-11 · source: live `ponytail:` comments in repo_

One row per marker. Revisit only when the named trigger fires. Do not “pay down” preemptively.

---

## client

### `client/src/utils/speech.js:12`
script regex, not langdetect.  
**ceiling:** ar/en  
**upgrade:** third language added

### `client/src/components/chat/Markdown.jsx:7`
bold / inline code / fences / lists only.  
**ceiling:** subset markdown  
**upgrade:** react-markdown when headings, tables, or links appear in replies

### `client/src/components/layout/AppLayout.jsx:115`
ink (not navy) — navy ramp inverts under `.dark` and white initials fail AA.  
**ceiling:** —  
**upgrade:** no-trigger — design rationale, not deferral · low risk

### `client/src/pages/ProfilePage.jsx:149`
ink stays dark in both themes; `navy-*` would invert under `.dark`.  
**ceiling:** —  
**upgrade:** no-trigger — same class as AppLayout · low risk

---

## server

### `server/services/ai/conversationService.js:301`
O(n²) re-stringify per trim (~100KB worst case).  
**ceiling:** fine under current budget  
**upgrade:** profiler shows it matters

### `server/services/ai/nlpService.js:25`
Arabic-block regex (not langdetect).  
**ceiling:** ar/en  
**upgrade:** third language added

---

## Summary

**6 markers · 2 no-trigger** (both theme rationale — not rot).

Every real shortcut has a named revisit condition. Ledger healthy.

Regenerate: grep `ponytail:` under `client/src` and `server` (skip `node_modules`).
