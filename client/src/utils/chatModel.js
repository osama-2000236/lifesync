// Shared chat/voice model selection. One storage key so Chat and Voice stay in sync.
import { DEFAULT_CHAT_MODEL_ID } from '../config/models';

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

/** Voice must converse — never use BERT template replies. */
export const resolveVoiceModelId = (id, fallback = DEFAULT_CHAT_MODEL_ID) => (
  id && id !== 'bert_local' ? id : fallback
);

/** Models suitable for real conversation (excludes classifier + custom upload). */
export const generativeModelsOnly = (models = []) => (
  (models || []).filter((m) => m && m.id && m.id !== 'bert_local' && m.id !== 'custom_local')
);
