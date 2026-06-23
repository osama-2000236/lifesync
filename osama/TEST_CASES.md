# LifeSync — Test Case Execution Report (12 Test Cases)

**Project:** LifeSync — Smart Life Management System
**Course:** COMP4200 · Birzeit University · Supervisor: Dr. Ala' Hasheesh
**Team:** Osama, Abdallah Aabed, Adam Weheidi
**Execution date:** 22 June 2026
**Build under test:** LifeSync v2.0 — local BERT default, model picker (4 options), assistant memory, cross-domain follow-ups
**Environment:** Windows 11 · Node 20 · MySQL 8 · BERT runtime on DirectML (GPU) · Chrome (Playwright-driven)

> Each teammate owns one main feature and executed 3+ test cases on it (12 total).
> Steps follow the **Test Case Execution Template** (Step ID / Description / Expected / Actual / Pass-Fail / Notes).

---

## Feature A — Conversational AI logging (enhanced BERT) · Designed by **Osama**

### TC-01 — Log a health metric through chat
- **Scenario:** Natural-language health logging
- **Description:** User tells the assistant they walked, and the metric is logged.
- **Pre-conditions:** User registered & logged in; BERT runtime running; user is on the Assistant (chat) page.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Type `I walked 8000 steps today` and press Enter | Assistant replies and a Steps entry is created | Reply: "Done — logged 8,000 steps. Your dashboard just refreshed with it…" | Pass | |
| 2 | Look at the entity badges under the reply | A badge shows `steps: 8000` | Badge `steps: 8000` shown | Pass | |
| 3 | Open Health page | A Steps = 8000 entry appears for today | Entry present (source: chat) | Pass | |

### TC-02 — Cross-domain "outing" follow-up
- **Scenario:** Everyday plan turns into a health + finance question
- **Description:** Saying "I'm going to town" makes the assistant ask how the user travels, linking cost and movement.
- **Pre-conditions:** Logged in; on the chat page.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Type `I'm going to town` | Assistant asks how the user is travelling | Asked: "…by car, by bus, or on foot?…" | Pass | |
| 2 | Observe the quick-reply buttons | Buttons: By car / By bus / Walking | All three shown | Pass | |
| 3 | Click `Walking` | Reply connects walking to wallet (free) + health (activity) and offers to log it | "Walking to the town is a free win… Want me to log the walk?…" | Pass | Commute mode saved to memory |

### TC-03 — Assistant remembers the user (memory)
- **Scenario:** Durable memory across the conversation
- **Description:** A stated fact is remembered and reused.
- **Pre-conditions:** Logged in; on the chat page.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Type `My name is Osama and I have a car` | Friendly reply; no error | Friendly daily-assistant reply | Pass | |
| 2 | Check the database `user_memories` table | Rows for `name` and `vehicle.car` exist | Both rows created | Pass | Memory is model-agnostic (stored in DB) |
| 3 | Switch the model (model menu) and chat again | Memory still applies after switching models | Memory carried over | Pass | Matches "transfer memory to new model" requirement |

### TC-04 — Mood / creative check-in nudge
- **Scenario:** Replies feel like a daily assistant
- **Description:** After logging, the assistant asks about mood or a creative follow-up.
- **Pre-conditions:** Logged in; on the chat page.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Type `Spent $15 on lunch` | Logs the expense and adds a mood/creative question | "…how's your mood today on a 1–10 scale?" appended | Pass | |
| 2 | Type `Feeling great, mood 8/10` | Logs mood; does NOT re-ask mood, asks a creative thing instead | "Want a quick tip to make tomorrow a little easier?" | Pass | |
| 3 | Confirm tone is detailed, not robotic | Reply is specific & friendly | Detailed, names the item logged | Pass | |

---

## Feature B — Model management (picker, upload, settings) · Designed by **Abdallah Aabed**

### TC-05 — Model picker shows 4 options with BERT default
- **Scenario:** Claude-style model menu
- **Description:** The chat exposes 4 selectable models; BERT is the active default.
- **Pre-conditions:** Logged in; on the chat page; BERT runtime running.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Click the model status pill (top-right of chat) | A menu opens | Menu opened | Pass | |
| 2 | Read the model list | Exactly 4: LifeSync BERT (default), Gemma 4, Gemma 3, Custom model | All 4 present | Pass | |
| 3 | Check the active model + execution | BERT marked active; execution shows GPU (directml) | BERT active · `directml` | Pass | "one model at a time" honored |

### TC-06 — Register / upload a custom model
- **Scenario:** Bring-your-own model
- **Description:** Upload a local model file (or endpoint) and register it as the custom option.
- **Pre-conditions:** Logged in; model menu open.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Hover the "Custom model" info icon | Tooltip explains GGUF/endpoint + GPU/CPU | Tooltip shown | Pass | |
| 2 | Click "Upload model from device" and pick a `.gguf` file | The file name fills in and the model name auto-fills | Name auto-filled from file | Pass | |
| 3 | Click "Use this model" | Model registers; backend confirms; appears as Custom in catalog | API returned `custom_model` registered | Pass | Activation needs LM Studio/Ollama present on the machine |

### TC-07 — Change the default model in Settings
- **Scenario:** Persisted model preference
- **Description:** The user changes their default model and it is saved.
- **Pre-conditions:** Logged in; on Settings (Account) page.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Open Settings → "Assistant Model" section | 4 models listed with the current one selected | Section shown, BERT selected | Pass | |
| 2 | Select a different model | Success message; preference saved to the account | "Default model updated…" | Pass | `users.preferred_model` updated |
| 3 | Log out and back in | The chosen model is activated on login | Preferred model activated | Pass | |

### TC-08 — Dashboard refreshes after a logged intent
- **Scenario:** Recording an intent updates the dashboard
- **Description:** Logging in chat updates the dashboard without a manual reload.
- **Pre-conditions:** Logged in; Dashboard open in one view, chat reachable.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Note current "7-Day Steps" value | A baseline value is shown | Baseline read | Pass | |
| 2 | In chat, log `walked 9000 steps` | Steps entry created | Entry created | Pass | |
| 3 | Return to the Dashboard | Steps total increases (event-driven refresh) | Total updated to include 9000 | Pass | `lifesync:data-changed` event |

---

## Feature C — Core app, auth & dashboards · Designed by **Adam Weheidi**

### TC-09 — Login with valid credentials
- **Scenario:** Authentication
- **Description:** A registered user signs in successfully.
- **Pre-conditions:** A user account exists.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Open `/login` and enter the registered email + password | Form accepts input | Accepted | Pass | |
| 2 | Click "Sign in" | Authenticated; redirected into the app | JWT issued; entered app | Pass | |
| 3 | Enter a wrong password and try again | Login is rejected with an error | "Invalid email or password." | Pass | Negative test |

### TC-10 — Onboarding includes the AI-model choice
- **Scenario:** Choose default model at sign-up
- **Description:** A new user picks their default model during onboarding.
- **Pre-conditions:** Newly registered user (onboarding not completed).

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | After first login, reach the onboarding wizard | Step 1 "Welcome" shows | Shown | Pass | |
| 2 | Click "Let's go" | Step 2 "Pick your AI model" appears with 4 options | Model step shown | Pass | |
| 3 | Pick a model and finish onboarding | Preference saved; land on Dashboard | Saved; Dashboard loaded | Pass | |

### TC-11 — Health logs list shows chat-logged entries
- **Scenario:** Data persistence & listing
- **Description:** Entries created through chat appear on the Health page.
- **Pre-conditions:** At least one health entry logged via chat.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Open the Health page | A list of health entries is shown | List shown | Pass | |
| 2 | Look for the steps/sleep/mood entries logged earlier | They are present with correct values/units | Steps 9000, Sleep 7h (420 min), Mood 8/10 present | Pass | |
| 3 | Click a filter tab (e.g. "Sleep") | Only that metric is shown | Filtered correctly | Pass | |

### TC-12 — Dashboard scores & insights with BERT
- **Scenario:** Single model drives chat AND dashboard
- **Description:** With BERT selected, the dashboard still shows scores, charts and recommendations (deterministic insight engine).
- **Pre-conditions:** Some health & finance data logged; BERT is the active model.

| Step ID | Step Description | Expected Results | Actual Results | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1 | Open the Dashboard | Stat cards show real values | Steps 17,000 · Sleep 7.0h · Mood 8.0 | Pass | |
| 2 | Read the Insights panel | Health & Finance scores + a weekly insight + recommendation | Health 77 · Finance 75 · weekly insight + recommendation shown | Pass | Deterministic engine, no cloud AI |
| 3 | View the charts | Health-trends, spending and mood-vs-activity charts render | All three charts rendered with data | Pass | |

---

## Summary

| # | Test Case | Owner | Result |
|---|-----------|-------|--------|
| TC-01 | Log health metric via chat | Osama | ✅ Pass |
| TC-02 | Cross-domain outing follow-up | Osama | ✅ Pass |
| TC-03 | Assistant memory + transfer on switch | Osama | ✅ Pass |
| TC-04 | Mood / creative check-in nudge | Osama | ✅ Pass |
| TC-05 | Model picker — 4 options, BERT default | Abdallah Aabed | ✅ Pass |
| TC-06 | Register / upload custom model | Abdallah Aabed | ✅ Pass |
| TC-07 | Change default model in Settings | Abdallah Aabed | ✅ Pass |
| TC-08 | Dashboard refresh on logged intent | Abdallah Aabed | ✅ Pass |
| TC-09 | Login with valid credentials | Adam Weheidi | ✅ Pass |
| TC-10 | Onboarding model-choice step | Adam Weheidi | ✅ Pass |
| TC-11 | Health logs list (chat-logged) | Adam Weheidi | ✅ Pass |
| TC-12 | Dashboard scores & insights (BERT) | Adam Weheidi | ✅ Pass |

**Result: 12 / 12 passed.** Screenshots of each flow are in `osama/screenshots/`.

> Note: the **Admin Portal** stat cards (total/active/new users, NLP response times, 24h activity) now
> render **real values** — the client was aligned to the API response shape. User management (activate/
> deactivate) and the system-log view are functional.
