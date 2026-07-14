// server/services/ai/sessionModelLock.js
// ============================================
// Per-turn model metadata. The old session lock is gone — mid-chat model
// switches are allowed; each assistant row just records which catalog model
// produced it (attribution in history / analytics).
// ============================================

const readCatalogModel = (entitiesJson) => {
  if (!entitiesJson || typeof entitiesJson !== 'object' || Array.isArray(entitiesJson)) return null;
  const id = entitiesJson.catalog_model;
  return id && typeof id === 'string' ? id : null;
};

/** Payload to store on the assistant ChatLog.entities_json for model attribution. */
const assistantModelMeta = (catalogModelId) => (
  catalogModelId ? { catalog_model: String(catalogModelId) } : null
);

module.exports = {
  assistantModelMeta,
  _readCatalogModel: readCatalogModel,
};
