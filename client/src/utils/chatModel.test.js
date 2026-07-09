import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadChatModelId,
  saveChatModelId,
  resolveVoiceModelId,
  generativeModelsOnly,
  MODEL_STORAGE_KEY,
} from './chatModel';

describe('chatModel utils', () => {
  beforeEach(() => { localStorage.clear(); });

  it('loads default when empty', () => {
    expect(loadChatModelId('gemma4_local')).toBe('gemma4_local');
  });

  it('persists and loads', () => {
    saveChatModelId('openai_chat');
    expect(localStorage.getItem(MODEL_STORAGE_KEY)).toBe('openai_chat');
    expect(loadChatModelId()).toBe('openai_chat');
  });

  it('resolveVoiceModelId never returns bert', () => {
    expect(resolveVoiceModelId('bert_local', 'gemma4_local')).toBe('gemma4_local');
    expect(resolveVoiceModelId('openai_chat', 'gemma4_local')).toBe('openai_chat');
    expect(resolveVoiceModelId(null, 'gemma4_local')).toBe('gemma4_local');
  });

  it('generativeModelsOnly drops bert and custom', () => {
    const list = generativeModelsOnly([
      { id: 'bert_local' },
      { id: 'gemma4_local' },
      { id: 'custom_local' },
      { id: 'openai_chat' },
    ]);
    expect(list.map((m) => m.id)).toEqual(['gemma4_local', 'openai_chat']);
  });
});
