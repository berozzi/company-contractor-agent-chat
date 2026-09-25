import { config } from './config.js';
import type { ChatRequest, ChatResponse } from './types.js';

const MAX_ERROR_DETAIL_LENGTH = 240;
const MAX_REPLY_LENGTH = 20_000;

export class WebhookError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code: string, statusCode = 502) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface WebhookResult {
  reply: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isUsefulText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const directReplyKeys = ['reply', 'response', 'answer', 'text', 'content', 'output'];
const nestedReplyKeys = [
  'data',
  'result',
  'body',
  'json',
  'payload',
  'message',
  'choices',
  'candidates',
  'items',
  'outputs',
];

/**
 * n8n workflows can return a different shape depending on the node used.
 * This extractor accepts the common shapes (including an array of output items)
 * while still returning a predictable `{ reply }` contract to the frontend.
 */
function extractReply(value: unknown, depth = 0): string | undefined {
  if (depth > 5) {
    return undefined;
  }

  if (isUsefulText(value)) {
    return value.trim().slice(0, MAX_REPLY_LENGTH);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const reply = extractReply(item, depth + 1);
      if (reply) {
        return reply;
      }
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of directReplyKeys) {
    const reply = extractReply(record[key], depth + 1);
    if (reply) {
      return reply;
    }
  }

  for (const key of nestedReplyKeys) {
    const reply = extractReply(record[key], depth + 1);
    if (reply) {
      return reply;
    }
  }

  return undefined;
}

function parsePayload(body: string, contentType: string | null): unknown {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return undefined;
  }

  const isJson = contentType?.toLowerCase().includes('json') ?? false;
  if (!isJson && !trimmedBody.startsWith('{') && !trimmedBody.startsWith('[')) {
    return trimmedBody;
  }

  try {
    return JSON.parse(trimmedBody) as unknown;
  } catch {
    // Some n8n nodes return plain text even when they set a JSON content type.
    return trimmedBody;
  }
}

function safeErrorDetail(body: string): string {
  const detail = body.replace(/\s+/g, ' ').trim();
  return detail.length > MAX_ERROR_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : detail;
}

export async function forwardToWebhook(request: ChatRequest): Promise<WebhookResult> {
  if (!config.webhookUrl) {
    throw new WebhookError(
      'Webhook agenta nie został jeszcze skonfigurowany. Uzupełnij WEBHOOK_URL w pliku .env.',
      'WEBHOOK_NOT_CONFIGURED',
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.webhookTimeoutMs);

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain;q=0.9',
        'Content-Type': 'application/json',
        ...(config.webhookSecret ? { 'x-webhook-secret': config.webhookSecret } : {}),
      },
      body: JSON.stringify({
        message: request.message,
        conversationId: request.conversationId,
        messages: request.messages,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    const payload = parsePayload(body, response.headers.get('content-type'));

    if (!response.ok) {
      const detail = safeErrorDetail(body);
      throw new WebhookError(
        detail
          ? `Webhook n8n zwrócił błąd (${response.status}): ${detail}`
          : `Webhook n8n zwrócił błąd HTTP ${response.status}.`,
        'WEBHOOK_HTTP_ERROR',
      );
    }

    const reply = extractReply(payload);
    if (!reply) {
      throw new WebhookError(
        'Webhook n8n nie zwrócił czytelnej odpowiedzi. Sprawdź format odpowiedzi w workflow.',
        'INVALID_WEBHOOK_RESPONSE',
      );
    }

    return { reply };
  } catch (error) {
    if (error instanceof WebhookError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new WebhookError(
        'Agent nie odpowiedział w wyznaczonym czasie. Spróbuj ponownie.',
        'WEBHOOK_TIMEOUT',
        504,
      );
    }

    throw new WebhookError(
      'Nie udało się połączyć z webhookiem n8n. Sprawdź adres i połączenie z serwerem.',
      'WEBHOOK_UNAVAILABLE',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function toChatResponse(request: ChatRequest, result: WebhookResult): ChatResponse {
  return {
    reply: result.reply,
    conversationId: request.conversationId,
  };
}
