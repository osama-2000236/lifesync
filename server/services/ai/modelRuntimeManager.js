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
    id: 'gemma3_local',
    label: 'Gemma 3 (local)',
    kind: 'generative',
    is_default: false,
    description: 'Local generative chat. Richer prose, slower than the classifier.',
    target: { provider: gemmaRuntime(), model: process.env.GEMMA3_MODEL || 'gemma3' },
    eta_ms: { gpu: 4000, cpu: 16000 },
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
];

const DEFAULT_MODEL_ID = 'bert_local';
const catalogEntry = (id) => MODEL_CATALOG.find((m) => m.id === id) || null;

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
        ? 'Classifier ready. Pick Gemma 3 or 4 from the menu for full conversation.'
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

const activeModelId = (provider) => {
  const direct = MODEL_CATALOG.find((m) => m.target.provider === provider);
  return (activation.model_id) || (direct ? direct.id : null);
};

const getModelCatalog = () => MODEL_CATALOG.map((m) => ({
  id: m.id,
  label: m.label,
  kind: m.kind,
  is_default: m.is_default,
  description: m.description,
  provider: m.target.provider,
  model: m.target.model,
  eta_ms: m.eta_ms,
  capabilities: capabilitiesFor(m.target.provider),
}));

const getRuntimeSnapshot = async () => {
  const activeProvider = _getProvider('chat');
  const active = await getAIProviderStatus('chat');
  const currentId = activeModelId(activeProvider);
  const entry = catalogEntry(currentId);
  return {
    active: {
      ...active,
      model_id: currentId,
      capabilities: capabilitiesFor(active.provider),
      eta: estimateEta(entry, active),
    },
    activation: { ...activation },
    default_model: DEFAULT_MODEL_ID,
    catalog: getModelCatalog(),
    hardware: hardwareSnapshot(),
    privacy: active.local
      ? 'Model inference stays on the configured local runtime; LifeSync context remains in your app database.'
      : 'The selected cloud provider receives the bounded context required for each reply.',
  };
};

module.exports = {
  getRuntimeSnapshot,
  getModelCatalog,
  startBestAvailableModel: startModel,
  startModel,
  _hardwareSnapshot: hardwareSnapshot,
  _capabilitiesFor: capabilitiesFor,
  _estimateEta: estimateEta,
  _catalog: MODEL_CATALOG,
};
