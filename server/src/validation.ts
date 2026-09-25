import type { ChatRequest, ConversationMessage, MessageRole } from './types.js';

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_HISTORY_LENGTH = 60;
const MAX_CONVERSATION_ID_LENGTH = 200;

export class RequestValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_REQUEST';

  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRole(value: unknown): MessageRole | undefined {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : undefined;
}

function parseHistory(value: unknown): ConversationMessage[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAX_HISTORY_LENGTH) {
    throw new RequestValidationError('Historia rozmowy ma nieprawidłowy format.');
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.content !== 'string') {
      return [];
    }

    const role = parseRole(item.role);
    const content = item.content.trim();
    if (!role || !content || content.length > MAX_MESSAGE_LENGTH) {
      return [];
    }

    return [{ role, content }];
  });
}

export function parseChatRequest(body: unknown): ChatRequest {
  if (!isRecord(body)) {
    throw new RequestValidationError('Body żądania musi być obiektem JSON.');
  }

  if (typeof body.message !== 'string') {
    throw new RequestValidationError('Pole message jest wymagane.');
  }

  const message = body.message.trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    throw new RequestValidationError(
      `Wiadomość musi mieć od 1 do ${MAX_MESSAGE_LENGTH} znaków.`,
    );
  }

  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim().slice(0, MAX_CONVERSATION_ID_LENGTH)
      : `conversation-${Date.now()}`;

  return {
    message,
    conversationId,
    messages: parseHistory(body.messages),
  };
}
