import {
  getAssistantMessageContent,
  getChatErrorMessage,
} from '../client/src/utils/chatResponse';
import {
  CHAT_REQUEST_TIMEOUT_MS,
  DEFAULT_API_TIMEOUT_MS,
} from '../client/src/services/requestTimeouts';

describe('chat response helpers', () => {
  it('prefers backend error text when the API returns an error field', () => {
    const error = {
      response: {
        data: {
          success: false,
          error: 'HF Space unavailable right now.',
        },
      },
    };

    expect(getChatErrorMessage(error)).toBe('HF Space unavailable right now.');
  });

  it('shows the clarification question when the backend asks a follow-up', () => {
    const result = {
      response: 'I need a bit more detail before I log that.',
      needs_clarification: true,
      clarification_question: 'Would you like me to log this as a $50 gym expense, 50 minutes of exercise, or both?',
      clarification_options: ['Gym expense', 'Exercise', 'Both'],
    };

    expect(getAssistantMessageContent(result)).toBe(result.clarification_question);
  });

  it('uses a longer timeout for chat requests than the shared API default', () => {
    expect(CHAT_REQUEST_TIMEOUT_MS).toBeGreaterThan(DEFAULT_API_TIMEOUT_MS);
  });
});
