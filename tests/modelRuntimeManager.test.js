jest.mock('../server/services/ai/providerClient', () => ({
  getAIProviderStatus: jest.fn(),
  _getProvider: jest.fn(() => 'bert_local'),
  _getProviderSettings: jest.fn(),
  _setRuntimeProvider: jest.fn(),
}));

const {
  _hardwareSnapshot,
  _capabilitiesFor,
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
