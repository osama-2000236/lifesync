// Shared assistant-model menu. Keep ids in sync with the server catalog
// (server/services/ai/modelRuntimeManager.js).
//
// Routing: BERT is the private in-server intent classifier; every generative
// model is a VERIFIED FREE OpenRouter model (zero inference cost) served with
// one OPENROUTER_API_KEY. All of them share the same LifeSync memory, chat
// history, and cross-domain data context. When a free pool is briefly
// rate-limited, the server hops to the next free model automatically.
// Labels are seeds only — live slug/pricing come from GET /api/ai/models
// (env can re-point openai_chat / openrouter_chat at paid models).
export const MODEL_OPTIONS = [
  { id: 'bert_local', label: 'LifeSync BERT', tag: 'local', desc: 'Classifier only — not used for voice conversation.' },
  { id: 'gemma4_local', label: 'Gemma 4 31B', tag: 'free', desc: 'OpenRouter free: google/gemma-4-31b-it:free. Good Arabic; free pool may 429.' },
  { id: 'gemma3_local', label: 'Gemma 4 Flash 26B', tag: 'free', desc: 'OpenRouter free: google/gemma-4-26b-a4b-it:free. Faster; free pool often rate-limits.' },
  { id: 'openai_chat', label: 'GPT (OpenRouter)', tag: 'free', desc: 'Default free: openai/gpt-oss-120b:free — or OPENROUTER_GPT_MODEL if set (may be paid).' },
  { id: 'openrouter_chat', label: 'Llama 3.3 70B', tag: 'free', desc: 'Default free: meta-llama/llama-3.3-70b-instruct:free — or OPENROUTER_MODEL if set.' },
  { id: 'custom_local', label: 'Custom model', desc: 'Your endpoint/file — only if you configure it.' },
];

export const DEFAULT_MODEL_ID = 'bert_local';

// Best default for actual conversation (voice + chat): free generative model.
export const DEFAULT_CHAT_MODEL_ID = 'gemma4_local';
