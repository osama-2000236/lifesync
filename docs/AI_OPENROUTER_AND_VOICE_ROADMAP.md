# LifeSync — OpenRouter Routing + Voice/Assistant Roadmap

_Last updated: 2026-06-29_

## 1. What changed (this session)

All **non-BERT** assistant models now route through **OpenRouter** with a single
`OPENROUTER_API_KEY`. BERT stays the private, in-server intent classifier + the
deterministic dashboard engine. Local Gemma remains an optional offline path.

| Picker entry      | Before                  | After (provider / model)                         |
|-------------------|-------------------------|--------------------------------------------------|
| `bert_local`      | local classifier        | **unchanged** — in-server, default               |
| `gemma3/4_local`  | ollama/lmstudio (local) | **unchanged** — offline option                   |
| `openai_chat`     | `openai` (key empty ✗)  | `openrouter` / `openai/gpt-5.4-mini`             |
| `anthropic_opus`  | `anthropic` (key empty ✗)| `openrouter` / `anthropic/claude-opus-4.8`      |
| `anthropic_sonnet`| `anthropic` (key empty ✗)| `openrouter` / `anthropic/claude-sonnet-4.6`    |
| `openrouter_chat` | already openrouter      | `openrouter` / `meta-llama/llama-3.3-70b-instruct`|

**Files touched**
- `server/services/ai/modelRuntimeManager.js` — `openRouterModel()` helper; cloud
  catalog entries re-pointed to `openrouter` with env-overridable slugs.
- `client/src/config/models.js` — synced menu, added `openrouter_chat`, `OpenRouter` tags.
- `.env` / `.env.example` — per-entry slug vars, documented one-key routing.

**Why it satisfies the goal**
- *Smart*: GPT-5.4 / Claude Opus 4.8 / Sonnet 4.6 reachable with one key.
- *Context + memory*: every cloud reply is Track B in `conversationService.js`,
  which injects `memory.summary`, 30-day `bertContext`, conversation history, and
  just-logged facts. Verified live — the model recalled a stored fact.
- *Cross-domain*: deterministic extractor (`bertNlpService`) + `insightEngine`
  Pearson correlations + `LinkedDomain` links remain in code, model-agnostic.
- *Configured in code*: catalog + slugs in source; never broken (each slug falls
  back to `OPENROUTER_MODEL`).

**Verification**: `npx jest modelRuntimeManager twoTrackChat providerClient runtimeConfig` → 44/44 pass; live OpenRouter inference returned grounded replies for GPT + Claude.

> **Action required to ship the UI:** rebuild the client (`cd client && npm run build`)
> so the new menu reaches `client/dist`. The built bundle is stale until then.

---

## 2. Recommended enhancements (smartness / context / memory)

1. **Per-user preferred model is persisted but confirm it's read on load.**
   `User.preferred_model` + `UserMemory` migration exist. Ensure
   `processMessageStream` falls back to the saved `preferred_model` when the
   request omits `model`, so a user's choice survives reloads without re-picking.
2. **OpenRouter fallback chain.** Add `models: [primary, backup]` to the OpenRouter
   payload (OpenRouter supports an array) so a 429/5xx on Claude auto-falls to
   Llama instead of dropping to the deterministic reply. One-line change in
   `callOpenAICompatible` / `generateChat`.
3. **Token-budget the context.** `buildBertContext` caps rows but not tokens. Add a
   rough char→token guard (~6k) before sending to cloud models to control cost.
4. **Memory recall surfacing.** Expose `GET /api/ai/memory` (read `buildMemoryContext`)
   so the UI can show "what the assistant remembers" — trust + debuggability.
5. **Insights via OpenRouter (optional).** `INSIGHTS_AI_PROVIDER=openrouter` already
   works through `generateStructuredJson`. Keep BERT deterministic as default; offer
   an LLM-narrated insight toggle for richer weekly summaries.
6. **Cost/latency telemetry.** OpenRouter returns usage + cost headers; log them in
   `model_runtime` so the admin portal can chart spend per model.

---

## 3. Voice mode — deployment plan (next session)

No voice code exists yet; this is greenfield. The SSE pipeline (`/api/chat/stream`)
and the model-agnostic two-track design make it a clean add.

**Architecture (browser-first, low-risk):**

```
Mic → STT → text → POST /api/chat/stream → assistant text → TTS → speaker
```

- **STT (speech→text)**
  - *Fast/free*: Web Speech API (`webkitSpeechRecognition`) in the browser — zero
    backend, good for a demo.
  - *Production*: OpenAI `whisper`/`gpt-4o-transcribe` **via OpenRouter or a
    dedicated audio endpoint** — add a `POST /api/voice/transcribe` (multipart audio)
    that proxies the key, mirroring how chat hides the OpenRouter key.
- **TTS (text→speech)**
  - *Fast/free*: `speechSynthesis` (browser).
  - *Production*: a TTS provider behind `POST /api/voice/speak` returning audio.
- **Streaming for natural turn-taking**
  - Today `processMessageStream` emits one `complete` event. For voice, switch the
    cloud path to **token streaming** (`stream:true` on the OpenRouter call) and
    forward deltas as SSE `token` events, so TTS can start speaking sooner.
  - BERT logging stays one-shot (Track A); only Track B prose streams.
- **Barge-in / VAD**: stop TTS when the user starts talking (client-side VAD).

**New surface to add next session**
- `server/routes/voiceRoutes.js` → `/api/voice/transcribe`, `/api/voice/speak`.
- `client/src/hooks/useVoice.js` → mic capture, VAD, playback.
- A mic button in `ChatPage.jsx` that reuses the existing model picker (so voice
  works with **any** OpenRouter model + BERT logging unchanged).
- Env: `VOICE_STT_MODEL`, `VOICE_TTS_MODEL`, `VOICE_TTS_VOICE`.

**Why it's low-risk:** voice is just an I/O shell around the existing text chat.
Logging, memory, cross-domain, and model routing are untouched.

---

## 4. Assistant deployment prep

- **Make a cloud model the default responder** (instead of BERT) per environment
  with `CHAT_AI_PROVIDER=openrouter` — keep BERT default in privacy/offline builds.
- **Health gate**: `GET /api/ai/health` already reports `openrouter_ready`; wire it
  into the deploy smoke test so a missing key fails the release, not the user.
- **Rate + cost guard**: extend `rateLimiter.js` with a per-user daily cloud-token
  cap before enabling cloud-by-default.
- **Secrets**: `OPENROUTER_API_KEY` is the only cloud secret now — one rotation
  point. Ensure it's set in the deploy env (Railway/Docker), not committed.
- **Streaming proxy**: confirm Nginx (`client/nginx.conf`) keeps `X-Accel-Buffering: no`
  for `/api/chat/stream` and the future `/api/voice/*` so SSE/audio isn't buffered.
