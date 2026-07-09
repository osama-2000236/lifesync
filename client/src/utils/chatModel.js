// Shared chat/voice model selection. One storage key so Chat and Voice stay in sync.
import { DEFAULT_CHAT_MODEL_ID, VOICE_MODEL_IDS } from '../config/models';

export const MODEL_STORAGE_KEY = 'lifesync.chat.model';

export const loadChatModelId = (fallback = DEFAULT_CHAT_MODEL_ID) => {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) || fallback;
  } catch {
    return fallback;
  }
};

export const saveChatModelId = (id) => {
  try {
    if (id) localStorage.setItem(MODEL_STORAGE_KEY, id);
  } catch { /* private mode */ }
};

/** Voice trio only — never BERT / flash / custom. */
export const resolveVoiceModelId = (id, fallback = DEFAULT_CHAT_MODEL_ID) => {
  if (id && VOICE_MODEL_IDS.includes(id)) return id;
  return VOICE_MODEL_IDS.includes(fallback) ? fallback : 'openai_chat';
};

/** Models suitable for real conversation (excludes classifier + custom upload). */
export const generativeModelsOnly = (models = []) => (
  (models || []).filter((m) => m && m.id && m.id !== 'bert_local' && m.id !== 'custom_local')
);

/** Voice studio: only the paid GPT, paid Llama, free Gemma trio. */
export const voiceModelsOnly = (models = []) => {
  const byId = new Map((models || []).map((m) => [m.id, m]));
  return VOICE_MODEL_IDS.map((id) => byId.get(id)).filter(Boolean);
};

/**
 * Mid-conversation model switch hurts consistency (different style, free-pool hops).
 * Lock once the user has messages or voice is mid-turn / chat is sending.
 */
export const canChangeModel = ({ messageCount = 0, busy = false } = {}) => (
  !busy && Number(messageCount) === 0
);
