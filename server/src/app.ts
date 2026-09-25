import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { forwardToWebhook, toChatResponse, WebhookError } from './webhook.js';
import { parseChatRequest, RequestValidationError } from './validation.js';

const allowedOrigins =
  config.allowedOrigins === '*'
    ? true
    : config.allowedOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

export const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  }),
);
app.use(express.json({ limit: '1mb' }));

app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'xyz-contractor-agent',
    webhookConfigured: Boolean(config.webhookUrl),
  });
});

app.post('/api/chat', async (request, response, next) => {
  try {
    const chatRequest = parseChatRequest(request.body);
    const result = await forwardToWebhook(chatRequest);
    response.json(toChatResponse(chatRequest, result));
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Nie znaleziono żądanego endpointu API.',
    },
  });
});

// Jeśli frontend został zbudowany, backend może serwować go z tego samego
// procesu. Dzięki temu po `npm run build` działa również `npm start`.
// W trybie developerskim Vite nadal udostępnia frontend na porcie 5173.
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const clientDistPath = resolve(currentDirectory, '../../client/dist');

if (existsSync(join(clientDistPath, 'index.html'))) {
  app.use(express.static(clientDistPath));
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) {
      response.sendFile(join(clientDistPath, 'index.html'));
      return;
    }
    next();
  });
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof RequestValidationError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (error instanceof WebhookError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Body żądania nie jest poprawnym JSON-em.' },
    });
    return;
  }

  console.error('[XYZ] Nieobsłużony błąd:', error);
  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Wystąpił nieoczekiwany błąd serwera.',
    },
  });
};

app.use(errorHandler);
