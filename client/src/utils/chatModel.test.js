import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadChatModelId,
  saveChatModelId,
  resolveVoiceModelId,
  generativeModelsOnly,
  voiceModelsOnly,
  canChangeModel,
  MODEL_STORAGE_KEY,
} from './chatModel';

describe('chatModel utils', () => {
  beforeEach(() => { localStorage.clear(); });

  it('loads default when empty', () => {
    expect(loadChatModelId('openai_chat')).toBe('openai_chat');
  });

  it('persists and loads', () => {
    saveChatModelId('openai_chat');
    expect(localStorage.getItem(MODEL_STORAGE_KEY)).toBe('openai_chat');
    expect(loadChatModelId()).toBe('openai_chat');
  });

  it('resolveVoiceModelId never returns bert; snaps to voice trio', () => {
    expect(resolveVoiceModelId('bert_local', 'openai_chat')).toBe('openai_chat');
    expect(resolveVoiceModelId('gemma3_local', 'openai_chat')).toBe('openai_chat');
    expect(resolveVoiceModelId('openai_chat', 'gemma4_local')).toBe('openai_chat');
    expect(resolveVoiceModelId('gemma4_local', 'openai_chat')).toBe('gemma4_local');
    expect(resolveVoiceModelId(null, 'openai_chat')).toBe('openai_chat');
  });

  it('voiceModelsOnly is the fixed trio order', () => {
    const list = voiceModelsOnly([
      { id: 'bert_local' },
      { id: 'gemma4_local' },
      { id: 'openai_chat' },
      { id: 'openrouter_chat' },
      { id: 'gemma3_local' },
    ]);
    expect(list.map((m) => m.id)).toEqual(['openai_chat', 'openrouter_chat', 'gemma4_local']);
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

  it('canChangeModel locks mid-conversation and while busy', () => {
    expect(canChangeModel({ messageCount: 0, busy: false })).toBe(true);
    expect(canChangeModel({ messageCount: 2, busy: false })).toBe(false);
    expect(canChangeModel({ messageCount: 0, busy: true })).toBe(false);
  });
});
