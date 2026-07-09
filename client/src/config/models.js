// Shared assistant-model menu. Keep ids in sync with
// server/services/ai/modelRuntimeManager.js.
//
// Voice trio (user picks one): GPT-5.4 Mini (paid), Llama 3.3 70B (paid),
// Gemma 4 free. Live slug/pricing always come from GET /api/ai/models.
// The server must call exactly the resolved slug — never hop to another model.

export const MODEL_OPTIONS = [
  { id: 'bert_local', label: 'LifeSync BERT', tag: 'local', desc: 'Classifier only — not used for voice.' },
  { id: 'openai_chat', label: 'GPT-5.4 Mini', tag: 'paid', desc: 'Paid OpenRouter — openai/gpt-5.4-mini only.' },
  { id: 'openrouter_chat', label: 'Llama 3.3 70B', tag: 'paid', desc: 'Paid OpenRouter — meta-llama/llama-3.3-70b-instruct only.' },
  { id: 'gemma4_local', label: 'Gemma 4 free', tag: 'free', desc: 'Free OpenRouter — google/gemma-4-31b-it:free only (no silent swap).' },
  { id: 'gemma3_local', label: 'Gemma 4 Flash free', tag: 'free', desc: 'Free (chat only) — not in the voice trio.' },
  { id: 'custom_local', label: 'Custom model', desc: 'Your endpoint/file if configured.' },
];

/** The three models offered in the voice studio. */
export const VOICE_MODEL_IDS = ['openai_chat', 'openrouter_chat', 'gemma4_local'];

export const DEFAULT_MODEL_ID = 'bert_local';

// Default conversation model for chat/voice (paid GPT-5.4 Mini).
export const DEFAULT_CHAT_MODEL_ID = 'openai_chat';

/** Same max harness for chat + voice — never diverge without a product reason. */
export const DEFAULT_CONTEXT_WINDOW = 'max';
