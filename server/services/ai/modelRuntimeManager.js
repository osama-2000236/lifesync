const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const {
  getAIProviderStatus,
  _getProvider,
  _getProviderSettings,
  _setRuntimeProvider,
  _setRuntimeModel,
  _clearRuntimeModel,
} = require('./providerClient');

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, '../../..');
const READY_STATES = new Set(['ready', 'configured']);

// ─── Selectable model menu (like a model picker). Default is local BERT. ───
// Gemma versions run locally through the configured generative runtime
// (Ollama by default). Model tags are env-overridable so partners can point
// each entry at whatever they pulled on their machine.
const gemmaRuntime = () => {
  const value = (process.env.GEMMA_LOCAL_RUNTIME || 'ollama').trim().toLowerCase();
  return ['ollama', 'lmstudio'].includes(value) ? value : 'ollama';
};

// The runtime used for a user-supplied custom model. LM Studio loads arbitrary
// GGUF files with automatic GPU offload; Ollama and any OpenAI-compatible
// endpoint are also supported.
const customRuntime = () => {
  const value = (process.env.CUSTOM_LOCAL_RUNTIME || 'lmstudio').trim().toLowerCase();
  return ['lmstudio', 'ollama', 'custom_hf'].includes(value) ? value : 'lmstudio';
};

// User-registered custom model (set via the upload button / endpoint field).
const customModelState = {
  name: process.env.CUSTOM_LOCAL_MODEL || null,
  runtime: customRuntime(),
  endpoint: process.env.CUSTOM_HF_ENDPOINT || null,
  source: null, // 'upload' | 'endpoint'
  file_name: null,
};

const MODEL_CATALOG = [
  {
    id: 'bert_local',
    label: 'LifeSync BERT (local)',
    kind: 'classifier',
    is_default: true,
    description: 'Private on-device intent classifier + deterministic engine. Fastest, fully offline.',
    target: { provider: 'bert_local', model: null },
    eta_ms: { gpu: 80, cpu: 300 },
  },
  {
    id: 'gemma4_local',
    label: 'Gemma 4 (local)',
    kind: 'generative',
    is_default: false,
    description: 'Local generative chat, newest Gemma. Set GEMMA4_MODEL to the tag you pulled.',
    target: { provider: gemmaRuntime(), model: process.env.GEMMA4_MODEL || 'gemma3' },
    eta_ms: { gpu: 5000, cpu: 20000 },
  },
  {
    id: 'gemma3_local',
    label: 'Gemma 3 (local)',
    kind: 'generative',
    is_default: false,
    description: 'Local generative chat. Richer prose, slower than the classifier.',
    target: { provider: gemmaRuntime(), model: process.env.GEMMA3_MODEL || 'gemma3' },
    eta_ms: { gpu: 4000, cpu: 16000 },
  },
  {
    id: 'openai_chat',
    label: 'OpenAI GPT',
    kind: 'generative',
    is_default: false,
    description: 'Cloud conversational model via OpenAI. Uses the same LifeSync memory, history, and data context.',
    target: { provider: 'openai', model: process.env.OPENAI_MODEL || 'gpt-5.4-mini' },
    eta_ms: { gpu: 1800, cpu: 1800 },
  },
  {
    id: 'anthropic_opus',
    label: 'Claude Opus',
    kind: 'generative',
    is_default: false,
    description: 'Anthropic Opus tier for deeper reasoning. Context transfers from the current chat and LifeSync memory.',
    target: { provider: 'anthropic', model: process.env.ANTHROPIC_OPUS_MODEL || 'claude-opus-4-8' },
    eta_ms: { gpu: 3500, cpu: 3500 },
  },
  {
    id: 'anthropic_sonnet',
    label: 'Claude Sonnet',
    kind: 'generative',
    is_default: false,
    description: 'Anthropic Sonnet tier for fast daily conversation. Shares the same LifeSync context as every model.',
    target: { provider: 'anthropic', model: process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-4-6' },
    eta_ms: { gpu: 2200, cpu: 2200 },
  },
  {
    id: 'openrouter_chat',
    label: 'OpenRouter',
    kind: 'generative',
    is_default: false,
    description: 'Cloud conversational model via OpenRouter (one key, many models). Set OPENROUTER_MODEL to pick the model. Shares the same LifeSync memory, history, and data context.',
    target: { provider: 'openrouter', model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct' },
    eta_ms: { gpu: 2000, cpu: 2000 },
  },
  {
    id: 'custom_local',
    label: 'Custom model',
    kind: 'generative',
    is_default: false,
    uploadable: true,
    description: 'Bring your own model. Upload a local file (e.g. GGUF) or point to any OpenAI-compatible endpoint. Loads on your GPU automatically and falls back to CPU.',
    target: { provider: customRuntime(), model: null },
    eta_ms: { gpu: 6000, cpu: 24000 },
  },
];

const DEFAULT_MODEL_ID = 'bert_local';
const catalogEntry = (id) => MODEL_CATALOG.find((m) => m.id === id) || null;

// Register a custom model from the upload button or endpoint field.
const registerCustomModel = ({ name, runtime, endpoint, fileName } = {}) => {
  const validRuntimes = ['lmstudio', 'ollama', 'custom_hf'];
  if (endpoint) {
    customModelState.endpoint = String(endpoint).trim();
    customModelState.runtime = 'custom_hf';
    customModelState.source = 'endpoint';
    process.env.CUSTOM_HF_ENDPOINT = customModelState.endpoint;
  } else if (runtime && validRuntimes.includes(runtime)) {
    customModelState.runtime = runtime;
  }
  if (fileName) {
    customModelState.file_name = String(fileName).trim();
    customModelState.source = customModelState.source || 'upload';
  }
  if (name) {
    customModelState.name = String(name).trim();
    if (customModelState.runtime === 'custom_hf') process.env.CUSTOM_HF_MODEL = customModelState.name;
  }
  if (!customModelState.name && !customModelState.endpoint) {
    throw new Error('Provide a model name (from your uploaded file) or an OpenAI-compatible endpoint.');
  }
  return getCustomModelState();
};

const getCustomModelState = () => ({
  name: customModelState.name,
  runtime: customModelState.runtime,
  endpoint: customModelState.endpoint,
  source: customModelState.source,
  file_name: customModelState.file_name,
  configured: Boolean(customModelState.name || customModelState.endpoint),
});

let activation = {
  status: 'idle',
  model_id: null,
  provider: null,
  message: 'No activation has been requested in this server process.',
  started_at: null,
  finished_at: null,
  error: null,
};
let activationPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hardwareSnapshot = () => {
  const cpus = os.cpus() || [];
  const memoryGb = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
  return {
    platform: os.platform(),
    architecture: os.arch(),
    cpu: cpus[0]?.model || 'Unknown CPU',
    logical_cores: cpus.length,
    memory_gb: memoryGb,
    recommended_local_model_size: memoryGb >= 24 ? '7B-9B' : memoryGb >= 12 ? '3B-4B' : '1B-2B',
    acceleration: 'The selected runtime automatically uses a supported GPU and falls back to CPU.',
  };
};

const capabilitiesFor = (provider) => ({
  conversation: provider !== 'bert_local',
  structured_actions: true,
  user_context: true,
  classifier_only: provider === 'bert_local',
});

// Providers whose chat path needs an API key (cloud / hosted).
const KEYED_PROVIDERS = new Set(['openai', 'anthropic', 'openrouter', 'gemini', 'groq', 'huggingface', 'custom_hf']);

/**
 * Resolve a picker model id → { provider, model, conversational, requiresKey }
 * for per-request chat routing (so each turn uses the chosen model without
 * mutating global state).
 */
const resolveModel = (modelId) => {
  const entry = catalogEntry(String(modelId || '').trim().toLowerCase());
  if (!entry) return null;
  if (entry.id === 'custom_local') {
    const runtime = customModelState.runtime || customRuntime();
    return {
      id: entry.id,
      provider: runtime,
      model: customModelState.name || null,
      conversational: true,
      requiresKey: KEYED_PROVIDERS.has(runtime),
      configured: Boolean(customModelState.name || customModelState.endpoint),
    };
  }
  const provider = entry.target.provider;
  return {
    id: entry.id,
    provider,
    model: entry.target.model,
    conversational: !capabilitiesFor(provider).classifier_only,
    requiresKey: KEYED_PROVIDERS.has(provider),
    configured: true,
  };
};

// Coarse expected-response-time estimate so the chat can tell the user how
// long to wait. Uses the GPU figure only when the live runtime reports a GPU
// execution provider; otherwise the CPU figure.
const estimateEta = (entry, activeStatus) => {
  if (!entry) return null;
  const ep = String(activeStatus?.execution_provider || '').toLowerCase();
  const onGpu = /dml|directml|cuda|gpu|metal|rocm/.test(ep);
  const ms = onGpu ? entry.eta_ms.gpu : entry.eta_ms.cpu;
  const seconds = ms / 1000;
  const human = ms < 1000
    ? 'usually under a second'
    : seconds < 10
      ? `about ${Math.round(seconds)} seconds`
      : `roughly ${Math.round(seconds / 5) * 5} seconds`;
  return { expected_ms: ms, on_gpu: onGpu, human };
};

const commandExists = async (command) => {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    await execFileAsync(locator, [command], { timeout: 3000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
};

const rootFromEndpoint = (endpoint, marker = '/v1') => {
  const url = new URL(endpoint);
  const markerIndex = url.pathname.indexOf(marker);
  url.pathname = markerIndex >= 0 ? url.pathname.slice(0, markerIndex) : '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

const waitFor = async (probe, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await probe();
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError || new Error('Runtime did not become ready in time.');
};

const startDetached = (command, args, cwd = projectRoot) => {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return child;
};

const activateOllama = async (model) => {
  const settings = _getProviderSettings('ollama');
  const root = rootFromEndpoint(settings.endpoint);
  const tagsUrl = `${root}/api/tags`;

  try {
    await axios.get(tagsUrl, { timeout: 2500 });
  } catch (initialError) {
    if (!(await commandExists('ollama'))) {
      throw new Error(`Ollama is not reachable at ${root} and the ollama command is not installed.`);
    }
    activation.message = 'Starting the Ollama engine…';
    const child = startDetached('ollama', ['serve']);
    try {
      await waitFor(
        () => axios.get(tagsUrl, { timeout: 2000 }),
        parseInt(process.env.LOCAL_RUNTIME_START_TIMEOUT_MS, 10) || 15_000
      );
    } catch (error) {
      if (child.exitCode === null && !child.killed) child.kill();
      throw error;
    }
  }

  const tags = await axios.get(tagsUrl, { timeout: 5000 });
  const installed = (tags.data?.models || []).map((item) => item.name || item.model).filter(Boolean);
  const hasModel = installed.some((name) => name === model || name.startsWith(`${model}:`));
  if (!hasModel) {
    activation.message = `Downloading ${model}. This happens once and may take several minutes…`;
    await axios.post(`${root}/api/pull`, { name: model, stream: false }, { timeout: 30 * 60 * 1000 });
  }

  activation.message = `Warming ${model}…`;
  await axios.post(`${root}/api/generate`, {
    model,
    prompt: 'Reply with OK.',
    stream: false,
    keep_alive: '30m',
    options: { num_predict: 4 },
  }, { timeout: 5 * 60 * 1000 });
  _setRuntimeProvider('chat', 'ollama');
  return getAIProviderStatus('chat', 'ollama');
};

const activateLMStudio = async (model) => {
  let status = await getAIProviderStatus('chat', 'lmstudio');
  if (status.status === 'ready') {
    _setRuntimeProvider('chat', 'lmstudio');
    return status;
  }
  if (!(await commandExists('lms'))) {
    throw new Error('LM Studio is not reachable and its lms command is not installed.');
  }
  if (status.status === 'unreachable') {
    activation.message = 'Starting the LM Studio local server…';
    await execFileAsync('lms', ['server', 'start'], { timeout: 30_000, windowsHide: true });
  }
  activation.message = `Loading ${model} in LM Studio…`;
  await execFileAsync('lms', ['load', model, '--yes'], { timeout: 10 * 60 * 1000, windowsHide: true });
  status = await waitFor(async () => {
    const next = await getAIProviderStatus('chat', 'lmstudio');
    if (next.status !== 'ready') throw new Error(`LM Studio model state: ${next.status}`);
    return next;
  }, 60_000);
  _setRuntimeProvider('chat', 'lmstudio');
  return status;
};

const localPythonCandidates = () => process.platform === 'win32'
  ? [
      path.join(projectRoot, 'model_runtime/.venv/Scripts/python.exe'),
      'py',
      'python',
    ]
  : [
      path.join(projectRoot, 'model_runtime/.venv/bin/python'),
      'python3',
      'python',
    ];

const findPython = async () => {
  for (const candidate of localPythonCandidates()) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return { command: candidate, prefix: [] };
    if (await commandExists(candidate)) return { command: candidate, prefix: candidate === 'py' ? ['-3'] : [] };
  }
  return null;
};

const activateBert = async () => {
  const existing = await getAIProviderStatus('chat', 'bert_local');
  if (existing.status === 'ready') {
    _clearRuntimeModel('bert_local');
    _setRuntimeProvider('chat', 'bert_local');
    return existing;
  }
  const python = await findPython();
  if (!python) throw new Error('Python 3 is required to start the bundled BERT classifier.');
  const onnxPath = path.join(projectRoot, 'model_runtime/artifacts/bert_intent_directml.onnx');
  const onnxServer = path.join(projectRoot, 'model_runtime/server.py');
  const pytorchServer = path.join(projectRoot, 'model_runtime/pytorch_server.py');
  const useOnnx = fs.existsSync(onnxPath);
  const script = useOnnx ? onnxServer : pytorchServer;
  if (!fs.existsSync(script)) throw new Error('The bundled BERT runtime files are missing.');

  activation.message = `Starting the BERT classifier on ${useOnnx ? 'automatic GPU/CPU' : 'CPU'}…`;
  const args = [...python.prefix, script];
  if (useOnnx) args.push('--provider', 'auto', '--onnx', onnxPath);
  startDetached(python.command, args);
  const status = await waitFor(async () => {
    const next = await getAIProviderStatus('chat', 'bert_local');
    if (next.status !== 'ready') throw new Error(`BERT runtime state: ${next.status}`);
    return next;
  }, 90_000);
  _setRuntimeProvider('chat', 'bert_local');
  return status;
};

// Activate exactly the requested model. No silent fallback to another model:
// if it fails, the failure is surfaced so the user/dev knows.
const activate = async (entry) => {
  activation.provider = entry.target.provider;
  activation.message = `Checking ${entry.label}…`;

  if (entry.target.provider === 'bert_local') {
    return activateBert();
  }

  // Custom user-supplied model: resolve its runtime + name at activation time.
  if (entry.id === 'custom_local') {
    if (!customModelState.name && !customModelState.endpoint) {
      throw new Error('No custom model registered yet. Upload a model file or set an endpoint first.');
    }
    const runtime = customModelState.runtime || customRuntime();
    if (runtime === 'ollama') {
      _setRuntimeModel('ollama', customModelState.name);
      return activateOllama(customModelState.name);
    }
    if (runtime === 'lmstudio') {
      _setRuntimeModel('lmstudio', customModelState.name);
      return activateLMStudio(customModelState.name);
    }
    // OpenAI-compatible endpoint (custom_hf)
    if (customModelState.name) _setRuntimeModel('custom_hf', customModelState.name);
    const customStatus = await getAIProviderStatus('chat', runtime);
    if (!READY_STATES.has(customStatus.status)) {
      throw new Error(`Custom model is ${customStatus.status}. Check the endpoint and model name.`);
    }
    _setRuntimeProvider('chat', runtime);
    return customStatus;
  }

  // Generative local model (Gemma): pin the chosen model on its runtime first.
  _setRuntimeModel(entry.target.provider, entry.target.model);
  if (entry.target.provider === 'ollama') return activateOllama(entry.target.model);
  if (entry.target.provider === 'lmstudio') return activateLMStudio(entry.target.model);

  const status = await getAIProviderStatus('chat', entry.target.provider);
  if (!READY_STATES.has(status.status)) {
    throw new Error(`${entry.label} is ${status.status}. Configure it first.`);
  }
  _setRuntimeProvider('chat', entry.target.provider);
  return status;
};

const runActivation = async (entry) => {
  try {
    const status = await activate(entry);
    activation = {
      ...activation,
      status: 'ready',
      message: entry.kind === 'classifier'
        ? 'LifeSync BERT is ready — your private on-device daily assistant.'
        : `${entry.label} is ready for conversation.`,
      finished_at: new Date().toISOString(),
      error: null,
      runtime: status,
    };
  } catch (error) {
    // Explicit failure — do not fall back to a different model.
    activation = {
      ...activation,
      status: 'error',
      message: `${entry.label} could not start: ${error.message}`,
      finished_at: new Date().toISOString(),
      error: error.message,
    };
  } finally {
    activationPromise = null;
  }
};

const startModel = async (requestedId = DEFAULT_MODEL_ID) => {
  // 'auto' resolves to the default model only — never hops between models.
  const id = (!requestedId || requestedId === 'auto') ? DEFAULT_MODEL_ID : requestedId;
  const entry = catalogEntry(id);
  if (!entry) throw new Error(`Unknown model: ${requestedId}`);
  if (activationPromise) return activation;
  activation = {
    status: 'starting',
    model_id: entry.id,
    provider: entry.target.provider,
    message: `Starting ${entry.label}…`,
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
  };
  activationPromise = runActivation(entry);
  return activation;
};

const activeModelId = (provider, activeStatus = {}) => {
  if (activation.status === 'ready' && activation.provider === provider && activation.model_id) {
    return activation.model_id;
  }
  const configuredModel = activeStatus.configured_model || null;
  const exact = MODEL_CATALOG.find((m) => (
    m.target.provider === provider
    && (m.id === 'custom_local'
      ? configuredModel && [customModelState.name, customModelState.file_name].filter(Boolean).includes(configuredModel)
      : (!m.target.model || m.target.model === configuredModel))
  ));
  if (exact) return exact.id;
  const direct = MODEL_CATALOG.find((m) => m.target.provider === provider);
  return direct ? direct.id : null;
};

const getModelCatalog = () => MODEL_CATALOG.map((m) => ({
  id: m.id,
  label: m.label,
  kind: m.kind,
  is_default: m.is_default,
  uploadable: Boolean(m.uploadable),
  description: m.description,
  provider: m.id === 'custom_local' ? customModelState.runtime : m.target.provider,
  model: m.id === 'custom_local' ? (customModelState.name || customModelState.file_name || null) : m.target.model,
  configured: m.id === 'custom_local' ? Boolean(customModelState.name || customModelState.endpoint) : true,
  eta_ms: m.eta_ms,
  capabilities: capabilitiesFor(m.id === 'custom_local' ? customModelState.runtime : m.target.provider),
}));

const getRuntimeSnapshot = async () => {
  const activeProvider = _getProvider('chat');
  const active = await getAIProviderStatus('chat');
  const currentId = activeModelId(activeProvider, active);
  const entry = catalogEntry(currentId);
  return {
    active: {
      ...active,
      model_id: currentId,
      capabilities: capabilitiesFor(active.provider),
      eta: estimateEta(entry, active),
    },
    activation: { ...activation },
    switching_to: activation.status === 'starting' ? activation.model_id : null,
    default_model: DEFAULT_MODEL_ID,
    catalog: getModelCatalog(),
    custom_model: getCustomModelState(),
    hardware: hardwareSnapshot(),
    privacy: active.local
      ? 'Model inference stays on the configured local runtime; LifeSync context remains in your app database.'
      : 'The selected cloud provider receives the bounded context required for each reply.',
  };
};

module.exports = {
  getRuntimeSnapshot,
  getModelCatalog,
  registerCustomModel,
  getCustomModelState,
  resolveModel,
  startBestAvailableModel: startModel,
  startModel,
  _hardwareSnapshot: hardwareSnapshot,
  _capabilitiesFor: capabilitiesFor,
  _estimateEta: estimateEta,
  _catalog: MODEL_CATALOG,
};
