# Handoff — Voice, Arabic RTL, Dark Mode

_Last updated: 2026-06-29_

This documents what was wired in code and what is a **design pass** to hand to the
Claude design platform. The engineering mechanism is complete and builds clean;
the visual polish is intentionally deferred.

## Live verification (2026-06-29)

| Target | Result |
|---|---|
| Backend `lifesync-production-fdf9.up.railway.app/api/health` | ✅ 200, v2.0.0, commit `7559947a` |
| `…/api/ai/health` | ✅ `ok:true`, `bert_ready:true`, `openrouter_ready:true` (BERT on CPU) |
| Backend `…-6f3e…` | ❌ 404 — dead/old, ignore |
| Frontend `lifesync.1202883.workers.dev` | ✅ serving SPA (bundle predates these changes) |
| Railway token | ❌ **Unauthorized** — reissue a project token to manage/deploy backend |
| Cloudflare token | ✅ valid + active — usable to deploy the Worker frontend |

## What's implemented (code, builds clean)

**Settings core** — `client/src/contexts/SettingsContext.jsx`
- `theme` (light/dark) + `locale` (en/ar) + `dir`, persisted to localStorage,
  applied to `<html>` (`class="dark"`, `dir`, `lang`). Pre-paint in `index.html`
  prevents flash. `t(key, vars)` translator.
- Toggle buttons: `client/src/components/common/SettingsControls.jsx` (in the
  sidebar + mobile header).

**i18n** — `client/src/i18n/{index,en,ar}.js`
- EN + AR dictionaries; missing AR keys fall back to EN, missing keys to the key.
- Localized so far: nav, brand tagline, chat shell, voice controls. **Not yet:**
  Dashboard, Health, Finance, Profile, Onboarding, Admin, Integrations, Landing,
  auth pages.

**Dark mode** — `client/src/styles/globals.css`
- Tailwind v4 `@custom-variant dark`; under `.dark` the `navy` ramp + surface
  tokens are inverted so text/borders/surfaces flip automatically. `bg-white`
  mapped to a raised dark surface; chat bubbles + scrollbar themed.

**RTL** — `globals.css` + `dir` on `<html>`
- Text/flow flips; chat bubble corners mirrored; app sidebar moves to the right;
  `rtl:rotate-180` on nav chevrons.

**Voice** — `client/src/hooks/useVoice.js` + `ChatPage.jsx`
- Browser STT (Web Speech API) → fills + auto-sends; browser TTS reads replies
  aloud (toggle). Locale-aware (`en-US`/`ar-SA`). Mic + speaker buttons in the
  composer. Assistant reply still comes from BERT/OpenRouter via `/api/chat/stream`.
- Backend: `server/routes/voiceRoutes.js` — `GET /api/voice/config` (capabilities)
  + `POST /api/voice/transcribe` (cloud-STT stub, off until `VOICE_STT_*` set).

## Design limitations → hand to the design platform

1. **Dark palette is a token-inversion baseline, not a designed dark theme.**
   Needs a proper dark scale + per-component `dark:` variants for: charts
   (Chart.js theming on Dashboard), brand gradients, status colors
   (emerald/coral/amber/blue contrast on dark), cards, shadows, focus rings.
   Audit WCAG AA contrast in dark.
2. **RTL visual mirroring is partial.** Audit every page for directional
   utilities (`ml-/mr-/pl-/pr-/left-/right-/translate-x`, icon direction,
   chart axes, number/percent formatting). Convert to logical props
   (`ms-/me-/ps-/pe-/start/end`) where mirroring matters.
3. **Arabic typography.** Add an Arabic webfont (e.g. IBM Plex Sans Arabic /
   Cairo / Noto Kufi), set it for `:lang(ar)`, tune line-height; the current DM
   Sans/Outfit don't cover Arabic well.
4. **Full translation coverage.** ~9 pages still English-only (see i18n list).
5. **Voice UI states.** Designed mic states (idle/listening/error/permission
   denied), a waveform/level meter, barge-in (stop TTS when user speaks), and a
   first-run mic-permission explainer.

Suggested handoff format to the design platform: screenshots of each page in
light+dark and en+ar, plus the token list in `globals.css @theme`, and ask for a
dark palette + RTL-corrected component specs.

## Production-readiness notes

- Frontend builds clean (`npm run build`). Deploy to the Worker needs the
  Cloudflare token (valid). Backend OpenRouter re-pointing needs a **valid
  Railway token** to deploy (current one is unauthorized).
- Ship dark/RTL behind the toggles (already opt-in, default light/EN), so a
  production deploy is low-risk even before the design polish lands.
