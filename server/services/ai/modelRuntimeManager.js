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
} = require('./providerClient');

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, '../../..');
const GENERATIVE_PROVIDERS = new Set(['gemini', 'huggingface', 'groq', 'custom_hf', 'ollama', 'lmstudio']);
const READY_STATES = new Set(['ready', 'configured']);

let activation = {
  status: 'idle',
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

const activateOllama = async () => {
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
  const hasModel = installed.some((name) => name === settings.model || name.startsWith(`${settings.model}:`));
  if (!hasModel) {
    activation.message = `Downloading ${settings.model}. This happens once and may take several minutes…`;
    await axios.post(`${root}/api/pull`, { name: settings.model, stream: false }, { timeout: 30 * 60 * 1000 });
  }

  activation.message = `Warming ${settings.model}…`;
  await axios.post(`${root}/api/generate`, {
    model: settings.model,
    prompt: 'Reply with OK.',
    stream: false,
    keep_alive: '30m',
    options: { num_predict: 4 },
  }, { timeout: 5 * 60 * 1000 });
  _setRuntimeProvider('chat', 'ollama');
  return getAIProviderStatus('chat', 'ollama');
};

const activateLMStudio = async () => {
  const settings = _getProviderSettings('lmstudio');
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
  activation.message = `Loading ${settings.model} in LM Studio…`;
  await execFileAsync('lms', ['load', settings.model, '--yes'], { timeout: 10 * 60 * 1000, windowsHide: true });
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

const getAutoProviderCandidates = async () => {
  const configured = _getProvider('chat');
  const configuredStatus = await getAIProviderStatus('chat', configured);
  const candidates = [];
  const add = (provider) => {
    if (provider && !candidates.includes(provider)) candidates.push(provider);
  };
  if (GENERATIVE_PROVIDERS.has(configured) && READY_STATES.has(configuredStatus.status)) add(configured);

  const [ollama, lmstudio] = await Promise.all([
    getAIProviderStatus('chat', 'ollama'),
    getAIProviderStatus('chat', 'lmstudio'),
  ]);
  if (ollama.status === 'ready') add('ollama');
  if (lmstudio.status === 'ready') add('lmstudio');
  if (await commandExists('ollama')) add('ollama');
  const lmStudioModel = (process.env.LM_STUDIO_MODEL || '').trim();
  if (lmStudioModel && lmStudioModel !== 'lifesync-local' && await commandExists('lms')) add('lmstudio');
  if (GENERATIVE_PROVIDERS.has(configured)) add(configured);
  if (configured === 'bert_local' || fs.existsSync(path.join(projectRoot, 'bert_best_model_10pct'))) add('bert_local');
  return candidates;
};

const activateProvider = async (provider) => {
    activation.provider = provider;
    activation.message = `Checking ${provider}…`;
    if (provider === 'ollama') return activateOllama();
    if (provider === 'lmstudio') return activateLMStudio();
    if (provider === 'bert_local') return activateBert();
    const status = await getAIProviderStatus('chat', provider);
    if (!READY_STATES.has(status.status)) throw new Error(`${provider} is ${status.status}. Configure its API key first.`);
    _setRuntimeProvider('chat', provider);
    return status;
};

const runActivation = async (requestedProvider) => {
  try {
    const candidates = requestedProvider === 'auto'
      ? await getAutoProviderCandidates()
      : [requestedProvider];
    if (!candidates.length) throw new Error('No configured or installed AI runtime was found.');
    const failures = [];
    let provider = null;
    let status = null;
    for (const candidate of candidates) {
      try {
        provider = candidate;
        status = await activateProvider(candidate);
        break;
      } catch (error) {
        failures.push(`${candidate}: ${error.message}`);
        activation.message = `${candidate} was unavailable; trying the next runtime…`;
      }
    }
    if (!status) throw new Error(failures.join(' | '));
    activation = {
      ...activation,
      status: 'ready',
      message: provider === 'bert_local'
        ? 'Classifier ready. Connect Ollama, LM Studio, or a cloud provider for full conversation.'
        : `${provider} is ready for conversation.`,
      finished_at: new Date().toISOString(),
      error: null,
      runtime: status,
    };
  } catch (error) {
    activation = {
      ...activation,
      status: 'error',
      message: error.message,
      finished_at: new Date().toISOString(),
      error: error.message,
    };
  } finally {
    activationPromise = null;
  }
};

const startBestAvailableModel = async (requestedProvider = 'auto') => {
  const allowed = new Set(['auto', ...GENERATIVE_PROVIDERS, 'bert_local']);
  if (!allowed.has(requestedProvider)) throw new Error(`Unsupported provider: ${requestedProvider}`);
  if (activationPromise) return activation;
  activation = {
    status: 'starting',
    provider: requestedProvider === 'auto' ? null : requestedProvider,
    message: 'Inspecting the available AI runtimes…',
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
  };
  activationPromise = runActivation(requestedProvider);
  return activation;
};

const getRuntimeSnapshot = async () => {
  const activeProvider = _getProvider('chat');
  const active = await getAIProviderStatus('chat');
  return {
    active: { ...active, capabilities: capabilitiesFor(active.provider) },
    activation: { ...activation },
    hardware: hardwareSnapshot(),
    privacy: active.local
      ? 'Model inference stays on the configured local runtime; LifeSync context remains in your app database.'
      : 'The selected cloud provider receives the bounded context required for each reply.',
  };
};

module.exports = {
  getRuntimeSnapshot,
  startBestAvailableModel,
  _hardwareSnapshot: hardwareSnapshot,
  _capabilitiesFor: capabilitiesFor,
};
