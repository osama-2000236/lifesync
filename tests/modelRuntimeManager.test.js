jest.mock('../server/services/ai/providerClient', () => ({
  getAIProviderStatus: jest.fn(),
  _getProvider: jest.fn(() => 'bert_local'),
  _getProviderSettings: jest.fn(),
  _setRuntimeProvider: jest.fn(),
}));

const {
  _hardwareSnapshot,
  _capabilitiesFor,
  startModel,
} = require('../server/services/ai/modelRuntimeManager');

describe('AI model runtime manager metadata', () => {
  test('reports portable hardware guidance without exposing secrets', () => {
    const hardware = _hardwareSnapshot();
    expect(hardware.logical_cores).toBeGreaterThan(0);
    expect(hardware.memory_gb).toBeGreaterThan(0);
    expect(['1B-2B', '3B-4B', '7B-9B']).toContain(hardware.recommended_local_model_size);
    expect(hardware).not.toHaveProperty('environment');
  });

  test('does not advertise the BERT classifier as conversational', () => {
    expect(_capabilitiesFor('bert_local')).toEqual({
      conversation: false,
      structured_actions: true,
      user_context: true,
      classifier_only: true,
    });
    expect(_capabilitiesFor('ollama').conversation).toBe(true);
  });
});

describe('startModel hosted-environment guard', () => {
  const ENV = process.env.RAILWAY_ENVIRONMENT;
  afterEach(() => {
    if (ENV === undefined) delete process.env.RAILWAY_ENVIRONMENT;
    else process.env.RAILWAY_ENVIRONMENT = ENV;
  });

  test('a local-runtime model resolves to the default instead of failing on a hosted backend', async () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    const activation = await startModel('gemma4_local');
    // Must NOT surface the localhost "Ollama not reachable" error to remote users.
    expect(activation.status).toBe('ready');
    expect(activation.error).toBeNull();
    expect(activation.model_id).toBe('bert_local');
    expect(activation.message).toMatch(/hosted server/i);
  });
});
