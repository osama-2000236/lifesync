// Shared assistant-model menu. Keep ids in sync with the server catalog
// (server/services/ai/modelRuntimeManager.js).
//
// Routing: BERT is the private in-server intent classifier; every generative
// model is a VERIFIED FREE OpenRouter model (zero inference cost) served with
// one OPENROUTER_API_KEY. All of them share the same LifeSync memory, chat
// history, and cross-domain data context. When a free pool is briefly
// rate-limited, the server hops to the next free model automatically.
export const MODEL_OPTIONS = [
  { id: 'bert_local', label: 'LifeSync BERT', tag: 'local', desc: 'Private, in-server, fastest logging. Template replies — pick a cloud model for real conversation.' },
  { id: 'gemma4_local', label: 'Gemma 4 31B', tag: 'free', desc: 'Google Gemma 4 31B — free via OpenRouter. Best default for conversation with full LifeSync context.' },
  { id: 'gemma3_local', label: 'Gemma 4 Flash 26B', tag: 'free', desc: 'Google Gemma 4 26B — free via OpenRouter. Lighter and quicker, same memory and context.' },
  { id: 'openai_chat', label: 'GPT-OSS 120B', tag: 'free', desc: 'OpenAI GPT-OSS 120B open-weight — free via OpenRouter. Strong reasoning with LifeSync context.' },
  { id: 'openrouter_chat', label: 'Llama 3.3 70B', tag: 'free', desc: 'Meta Llama 3.3 70B — free via OpenRouter. Auto-falls back to another free model when the pool is busy.' },
  { id: 'custom_local', label: 'Custom model', desc: 'Bring your own — upload a file or set an endpoint in the chat model menu.' },
];

export const DEFAULT_MODEL_ID = 'bert_local';

// Best default for actual conversation (voice + chat): free generative model.
export const DEFAULT_CHAT_MODEL_ID = 'gemma4_local';
