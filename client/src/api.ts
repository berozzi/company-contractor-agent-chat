import { resolveApiBaseUrl } from './apiBase';
import type { ChatResponse } from './types';

// Adres backendu. Na Vercelu ustawiamy API_URL (prefiks dopisany w vite.config.ts),
// lokalnie zmienna jest pusta i działa proxy z vite.config.ts.
// "/api" doklejamy automatycznie, wiec API_URL moze byc wpisany z nim lub bez.
const configuredApiUrl = (import.meta.env.API_URL || '').trim();
export const apiBaseUrl = resolveApiBaseUrl(configuredApiUrl);
export const isApiConfigured = configuredApiUrl.length > 0;

if (import.meta.env.PROD && !isApiConfigured) {
  console.warn(
    '[XYZ] Nie ustawiono API_URL - frontend użyje adresu /api, ' +
      'czyli własnej domeny. Na Vercel ustaw API_URL=' +
      'https://<projekt-backend>.vercel.app i zrób redeploy.',
  );
}

const requestTimeoutMs = 90_000;

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function getErrorMessage(
  body: unknown,
  fallback: string,
): { message?: string; code?: string } {
  if (typeof body !== 'object' || body === null) {
    return { message: fallback };
  }

  const error = (body as ApiErrorBody).error;
  return {
    message: error?.message ?? fallback,
    code: error?.code,
  };
}

export interface HealthResponse {
  status: string;
  webhookConfigured?: boolean;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: GET ${apiBaseUrl}/health -> HTTP ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}

export async function sendChatMessage(input: {
  message: string;
  sessionID: string;
  conversationId: string;
}): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        message: input.message,
        sessionID: input.sessionID,
        conversationId: input.conversationId,
      }),
      signal: controller.signal,
    });

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }

    if (!response.ok) {
      const error = getErrorMessage(
        responseBody,
        'Nie udało się połączyć z agentem. Spróbuj ponownie.',
      );
      throw new ApiError(error.message ?? 'Wystąpił błąd połączenia.', error.code, response.status);
    }

    if (
      typeof responseBody !== 'object' ||
      responseBody === null ||
      typeof (responseBody as { reply?: unknown }).reply !== 'string' ||
      !(responseBody as { reply: string }).reply.trim()
    ) {
      throw new ApiError('Agent zwrócił pustą odpowiedź. Spróbuj ponownie.', 'EMPTY_REPLY');
    }

    return responseBody as ChatResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        'Odpowiedź agenta zajęła zbyt dużo czasu. Spróbuj ponownie.',
        'CLIENT_TIMEOUT',
      );
    }

    throw new ApiError(
      `Nie udało się połączyć z serwerem: GET ${apiBaseUrl}/chat. Sprawdź, czy backend jest uruchomiony.`,
      'NETWORK_ERROR',
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
