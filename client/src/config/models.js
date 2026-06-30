// Shared assistant-model menu. Keep ids in sync with the server catalog
// (server/services/ai/modelRuntimeManager.js).
//
// Routing: BERT is the private in-server intent classifier; the local Gemma
// options run on-device. Every other (cloud) model is served through OpenRouter
// with a single OPENROUTER_API_KEY, and all of them share the same LifeSync
// memory, chat history, and cross-domain data context.
export const MODEL_OPTIONS = [
  { id: 'bert_local', label: 'LifeSync BERT', tag: 'default', desc: 'Private, on-device, fastest. Powers chat + dashboard fully offline.' },
  { id: 'gemma4_local', label: 'Gemma 4', tag: 'OpenRouter', desc: 'Google Gemma 4 via OpenRouter — cloud, no local install.' },
  { id: 'gemma3_local', label: 'Gemma 3', tag: 'OpenRouter', desc: 'Google Gemma 3 via OpenRouter — cloud, no local install.' },
  { id: 'openai_chat', label: 'OpenAI GPT', tag: 'OpenRouter', desc: 'GPT via OpenRouter, with full LifeSync memory and chat-history transfer.' },
  { id: 'anthropic_opus', label: 'Claude Opus', tag: 'OpenRouter', desc: 'Claude Opus via OpenRouter — deeper reasoning with the same LifeSync context.' },
  { id: 'anthropic_sonnet', label: 'Claude Sonnet', tag: 'OpenRouter', desc: 'Claude Sonnet via OpenRouter — fast daily conversation with transferred context.' },
  { id: 'openrouter_chat', label: 'OpenRouter (Llama 3.3)', tag: 'OpenRouter', desc: 'Open-weight cloud chat via OpenRouter. One key, many models — shares LifeSync memory + context.' },
  { id: 'custom_local', label: 'Custom model', desc: 'Bring your own — upload a file or set an endpoint in the chat model menu.' },
];

export const DEFAULT_MODEL_ID = 'bert_local';
