# 📁 osama/ — Deliverables Index

Everything for the team is in this folder.

| File | What it is |
|------|-----------|
| **README_PARTNERS.md** | Step-by-step guide to run on a **fresh device** (for Abdallah & Adam). Includes the one-command launcher: `npm run setup` once, then `npm start` (or double-click `setup.bat` / `start.bat`). |
| **TEST_CASES.docx** | 12 executed test cases in the official template format (Word). 12/12 passed. |
| **TEST_CASES.md** | Same 12 test cases in Markdown (easy to read on GitHub). |
| **screenshots/** | One screenshot per app flow (18 images), captured from the live app. |
| **INDEX.md** | This file. |

---

## What changed in this version (for the defense)

The AI layer was upgraded so LifeSync feels like a **daily assistant**, not just a logger:

1. **Local BERT is the default model** — runs on your own GPU (DirectML) / CPU, fully offline. It powers
   both the chat and the dashboard.
2. **Memory** — the assistant remembers durable facts about you (name, that you have a car, routines,
   budget…). Memory lives in the app database (`user_memories`), so it **transfers automatically when you
   switch models** — exactly like the requirement.
3. **Detailed, human replies** — every reply confirms exactly what was logged, mentions the dashboard
   refresh, and asks about your **mood** or a **creative follow-up**.
4. **Cross-domain follow-ups from everyday talk** — e.g. *"I'm going to town"* → the assistant asks
   *"by car, by bus, or on foot?"* and connects the answer to your **money (cost)** and **health (movement)**.
5. **Model picker like a chat app** — 4 options: **BERT (default), Gemma 4, Gemma 3, Custom**. The custom
   option has an **upload-from-device** button (with a tooltip) and accepts any OpenAI-compatible endpoint.
   The runtime uses the **GPU automatically** and falls back to CPU. Only **one model runs at a time**.
6. **Pick your model at sign-up** (onboarding step) and **change it in Settings** at any time.
7. **Dashboard refreshes instantly** after the assistant logs something.

### Where it lives in the code (for reference)
- Memory: `server/models/UserMemory.js`, `server/services/ai/memoryService.js`
- Enhanced replies + cross-domain follow-up: `server/services/ai/bertNlpService.js`
- Model picker / custom upload / GPU-CPU: `server/services/ai/modelRuntimeManager.js`, `server/routes/aiRoutes.js`, `client/src/pages/ChatPage.jsx`
- Default model at sign-up / settings: `client/src/pages/OnboardingPage.jsx`, `client/src/pages/ProfilePage.jsx`, `client/src/config/models.js`
- DB migration: `server/migrations/20260620-003-add-user-memory-and-preferred-model.js`

### Multi-provider chat with context transfer (switch models mid-conversation)
- The chat now works **like any provider out there**: the model you pick (BERT, Gemma 3/4,
  **OpenAI GPT, Claude Opus, Claude Sonnet**, or a custom model) gets the **full multi-turn
  conversation history + your memory + what was just logged**, and replies in natural prose.
- **Switching the model mid-thread carries the context** — verified live: after telling Gemma a
  budget in one turn, switching kept it ("your monthly budget is around $1200"). Just like
  Opus → Sonnet in Claude.
- **Hybrid two-track:** a deterministic extractor still logs health/finance reliably on *every*
  model; the chosen model only writes the conversation. So logging never breaks when you switch.
- **Cloud models are key-gated:** OpenAI/Claude appear in the menu and go live when you add
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` to `.env`; without a key they gracefully reply with the
  on-device assistant (no crash). Each reply shows a small **badge** of which model produced it.
- Code: `server/services/ai/conversationService.js` (two-track orchestrator),
  `providerClient.generateChat` (multi-turn, all providers), `modelRuntimeManager.resolveModel`
  (per-request model), `chatController` (sends the chosen model per turn).

### Verified with a real generative model
- **Gemma 4 runs locally via LM Studio.** Selecting "Gemma 4" auto-loads `google/gemma-4-e4b` and the chat
  switches to it (one model at a time). It even uses your memory/context in replies. Set the default model
  for Gemma/Custom in `.env` (`GEMMA_LOCAL_RUNTIME=lmstudio`, `GEMMA4_MODEL=google/gemma-4-e4b`).

### Tests
- `npm test` → **229 automated backend tests pass** (includes new memory, cross-domain, and
  clarification-handling tests).
- The 12 manual test cases in `TEST_CASES.docx` were executed on the live app (screenshots in `screenshots/`).
