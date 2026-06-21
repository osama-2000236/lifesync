export const DEFAULT_API_TIMEOUT_MS = 30000;
// Aligned to the current custom HF server budget: 30s request start + 120s stream.
export const CHAT_REQUEST_TIMEOUT_MS = 150000;
// Local BERT dashboard insights can take longer on first generation.
export const INSIGHTS_REQUEST_TIMEOUT_MS = 210000;
