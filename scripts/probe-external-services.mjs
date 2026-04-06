const RAILWAY_HEALTH_URL =
  process.env.RAILWAY_HEALTH_URL || 'https://lifesync-production-6f3e.up.railway.app/api/health';
const HF_SPACE_URL =
  (process.env.HF_SPACE_URL || 'https://os-1202883-lifesync-api.hf.space').replace(/\/+$/, '');
const HF_TIMEOUT_MS = Number(process.env.HF_PROBE_TIMEOUT_MS || 120000);
const REQUEST_TIMEOUT_MS = Number(process.env.PROBE_REQUEST_TIMEOUT_MS || 30000);

const withTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const probeRailway = async () => {
  const response = await withTimeout(RAILWAY_HEALTH_URL);
  assert(response.ok, `Railway health check failed with status ${response.status}`);

  const payload = await response.json();
  assert(payload?.success === true, 'Railway health check payload is missing success=true');
  console.log(`[probe] Railway OK: ${RAILWAY_HEALTH_URL}`);
};

const parseSseCompletionPayload = (text) => {
  const lines = text.split(/\r?\n/);
  let currentEvent = '';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push({
        event: currentEvent,
        value: line.slice('data:'.length).trim(),
      });
    }
  }

  const completion = dataLines.find((entry) => entry.event === 'complete');
  if (!completion) {
    return null;
  }

  try {
    const parsed = JSON.parse(completion.value);
    return Array.isArray(parsed) ? parsed[0] : null;
  } catch {
    return null;
  }
};

const probeHfSpace = async () => {
  const infoUrl = `${HF_SPACE_URL}/gradio_api/info`;
  const infoResponse = await withTimeout(infoUrl);
  assert(infoResponse.ok, `HF info endpoint failed with status ${infoResponse.status}`);

  const infoPayload = await infoResponse.json();
  assert(
    Boolean(infoPayload?.named_endpoints?.['/infer']),
    'HF info payload is missing /infer endpoint metadata'
  );

  const startResponse = await withTimeout(
    `${HF_SPACE_URL}/gradio_api/call/infer`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          'Return JSON only.',
          'I spent $5 on tea',
          0.1,
          256,
        ],
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  assert(startResponse.ok, `HF infer call failed with status ${startResponse.status}`);

  const startPayload = await startResponse.json();
  const eventId = startPayload?.event_id;
  assert(eventId, 'HF infer call did not return event_id');

  const completionResponse = await withTimeout(
    `${HF_SPACE_URL}/gradio_api/call/infer/${eventId}`,
    {},
    HF_TIMEOUT_MS
  );
  assert(
    completionResponse.ok,
    `HF infer completion stream failed with status ${completionResponse.status}`
  );

  const streamText = await completionResponse.text();
  const completionPayload = parseSseCompletionPayload(streamText);
  assert(completionPayload && String(completionPayload).trim(), 'HF infer completion payload is empty');

  console.log(`[probe] Hugging Face OK: ${HF_SPACE_URL}`);
};

const main = async () => {
  await probeRailway();
  await probeHfSpace();
  console.log('[probe] External dependency probes passed.');
};

main().catch((error) => {
  console.error(`[probe] ${error.message}`);
  process.exit(1);
});
