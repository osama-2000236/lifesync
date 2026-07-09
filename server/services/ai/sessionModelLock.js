// server/services/ai/sessionModelLock.js
// ============================================
// Session model lock — once an assistant turn stored catalog_model for this
// session, keep that model. Unlock = new session_id.
// Durable only (ChatLog). Client already blocks mid-chat switches.
// ============================================

const ChatLog = require('../../models/ChatLog');

const readCatalogModel = (entitiesJson) => {
  if (!entitiesJson || typeof entitiesJson !== 'object' || Array.isArray(entitiesJson)) return null;
  const id = entitiesJson.catalog_model;
  return id && typeof id === 'string' ? id : null;
};

/**
 * Resolve which catalog model id this turn should use.
 * @returns {{ modelId: string|null, denied: boolean, locked: string|null, requested: string|null }}
 */
const resolveSessionModel = async (userId, sessionId, requestedModelId) => {
  const requested = requestedModelId ? String(requestedModelId).trim().toLowerCase() : null;
  if (!userId || !sessionId) {
    return { modelId: requested, denied: false, locked: null, requested };
  }

  let locked = null;
  try {
    const rows = await ChatLog.findAll({
      where: { user_id: userId, session_id: sessionId, role: 'assistant' },
      attributes: ['entities_json'],
      order: [['id', 'ASC']],
      limit: 8,
    });
    for (const row of rows) {
      const id = readCatalogModel(row.entities_json);
      if (id) {
        locked = id;
        break;
      }
    }
  } catch {
    // DB probe failure must not break chat — fall through to request model.
  }

  if (locked) {
    if (requested && requested !== locked) {
      return { modelId: locked, denied: true, locked, requested };
    }
    return { modelId: locked, denied: false, locked, requested };
  }

  // First turn (no durable lock yet) — use the request.
  return { modelId: requested, denied: false, locked: null, requested };
};

/** Payload to store on the assistant ChatLog.entities_json for durable lock. */
const assistantModelMeta = (catalogModelId) => (
  catalogModelId ? { catalog_model: String(catalogModelId) } : null
);

module.exports = {
  resolveSessionModel,
  assistantModelMeta,
  _readCatalogModel: readCatalogModel,
};
