import { config as loadEnv } from 'dotenv';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(currentDirectory, '../../.env') });
loadEnv();

const port = Number(process.env.PORT || 3001);
const webhookUrl =
  process.env.WEBHOOK_URL ||
  'https://primary-production-56b7.up.railway.app/webhook/52df2fc4-1a28-447e-9800-297621090ce5/chat';

const app = express();

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase())
  .filter(Boolean);

// Bez FRONTEND_URL (lub z wartoscia "*") backend dopuszcza kazdy origin.
// Chat jest publiczny i nie uzywa ciasteczek, wiec nie ma powodu go blokowac.
const allowAllOrigins = configuredOrigins.length === 0 || configuredOrigins.includes('*');
const restrictedOrigins = allowAllOrigins ? [] : configuredOrigins;

function matchesOrigin(origin: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }

  if (!pattern.includes('*')) {
    return origin === pattern;
  }

  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(origin);
}

function isOriginAllowed(origin: string): boolean {
  if (allowAllOrigins) {
    return true;
  }

  return restrictedOrigins.some((pattern) => matchesOrigin(origin, pattern));
}

app.use((request, response, next) => {
  const requestOrigin = request.headers.origin;
  response.setHeader('Vary', 'Origin');

  if (requestOrigin) {
    const origin = requestOrigin.trim().replace(/\/+$/, '').toLowerCase();

    if (isOriginAllowed(origin)) {
      response.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else {
      console.warn(
        `[XYZ] Odrzucony origin CORS: ${requestOrigin} (dozwolone: ${restrictedOrigins.join(', ')})`,
      );
    }
  }

  response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  response.setHeader(
    'Access-Control-Allow-Headers',
    request.headers['access-control-request-headers'] || ALLOWED_HEADERS,
  );
  response.setHeader('Access-Control-Max-Age', '86400');

  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    webhookConfigured: true,
    cors: allowAllOrigins ? 'allow-all' : 'restricted',
    allowedOrigins: allowAllOrigins ? '*' : restrictedOrigins,
  });
});

app.post('/api/chat', async (request, response) => {
  const body = (request.body ?? {}) as {
    message?: unknown;
    sessionID?: unknown;
    conversationId?: unknown;
  };

  if (typeof body.message !== 'string' || !body.message.trim()) {
    response.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Pole message jest wymagane.' },
    });
    return;
  }

  const message = body.message.trim();
  const sessionID =
    (typeof body.sessionID === 'string' && body.sessionID.trim()) ||
    (typeof body.conversationId === 'string' && body.conversationId.trim()) ||
    randomUUID();
  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain',
      },
      body: JSON.stringify({
        // Format Chat Triggera n8n.
        action: 'sendMessage',
        chatInput: message,
        sessionId: sessionID,
        // Alias zgodny z wcześniejszym wymaganiem aplikacji.
        sessionID,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const rawResponse = await webhookResponse.text();
    if (!webhookResponse.ok) {
      const detail = rawResponse.trim().slice(0, 300);
      console.error(`[XYZ] Webhook n8n zwrócił HTTP ${webhookResponse.status}: ${detail}`);
      response.status(502).json({
        error: {
          code: 'WEBHOOK_ERROR',
          message: detail
            ? `Webhook n8n zwrócił błąd: ${detail}`
            : `Webhook n8n zwrócił HTTP ${webhookResponse.status}.`,
        },
      });
      return;
    }

    const reply = extractReply(rawResponse);
    if (!reply) {
      response.status(502).json({
        error: {
          code: 'EMPTY_WEBHOOK_RESPONSE',
          message: 'Webhook n8n zwrócił pustą odpowiedź.',
        },
      });
      return;
    }

    response.json({ reply, sessionID, conversationId: sessionID });
  } catch (error) {
    console.error('[XYZ] Błąd połączenia z webhookem n8n:', error);
    response.status(502).json({
      error: {
        code: 'WEBHOOK_UNAVAILABLE',
        message: 'Nie udało się połączyć z webhookem n8n.',
      },
    });
  }
});

function extractReply(rawResponse: string): string {
  if (!rawResponse.trim()) {
    return '';
  }

  let payload: unknown = rawResponse;
  try {
    payload = JSON.parse(rawResponse) as unknown;
  } catch {
    return rawResponse.trim();
  }

  return findText(payload)?.trim() ?? '';
}

function findText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() ? value : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findText(item);
      if (text) {
        return text;
      }
    }
    return undefined;
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    'reply',
    'response',
    'answer',
    'text',
    'content',
    'output',
    'data',
    'message',
    'json',
    'result',
    'body',
  ]) {
    const text = findText(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

const clientDist = resolve(currentDirectory, '../../client/dist');
if (existsSync(join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) {
      response.sendFile(join(clientDist, 'index.html'));
      return;
    }
    next();
  });
}

app.listen(port, () => {
  console.log(`[XYZ] Backend: http://localhost:${port}`);
  console.log(`[XYZ] Webhook: ${webhookUrl}`);
  console.log(
    `[XYZ] CORS: ${allowAllOrigins ? 'dowolny origin' : restrictedOrigins.join(', ')}`,
  );
});
