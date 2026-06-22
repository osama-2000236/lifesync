// Shared assistant-model menu. Keep ids in sync with the server catalog
// (server/services/ai/modelRuntimeManager.js).
export const MODEL_OPTIONS = [
  { id: 'bert_local', label: 'LifeSync BERT', tag: 'default', desc: 'Private, on-device, fastest. Powers chat + dashboard fully offline.' },
  { id: 'gemma4_local', label: 'Gemma 4 (local)', desc: 'Newest local generative model — richer prose.' },
  { id: 'gemma3_local', label: 'Gemma 3 (local)', desc: 'Local generative chat.' },
  { id: 'openai_chat', label: 'OpenAI GPT', desc: 'Cloud conversation with full LifeSync memory and chat history transfer.' },
  { id: 'anthropic_opus', label: 'Claude Opus', desc: 'Anthropic Opus tier for deeper reasoning with the same LifeSync context.' },
  { id: 'anthropic_sonnet', label: 'Claude Sonnet', desc: 'Anthropic Sonnet tier for fast daily conversation with transferred context.' },
  { id: 'custom_local', label: 'Custom model', desc: 'Bring your own — upload a file or set an endpoint in the chat model menu.' },
];

export const DEFAULT_MODEL_ID = 'bert_local';
