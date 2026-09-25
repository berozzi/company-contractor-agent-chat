import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Skrypt może być uruchamiany z katalogu server (npm workspace), dlatego
// najpierw szukamy konfiguracji w katalogu głównym repozytorium.
const repositoryEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
loadEnv({ path: repositoryEnvPath });
loadEnv();

function readPort(value: string | undefined): number {
  const parsed = Number(value ?? 3001);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : 3001;
}

function readTimeout(value: string | undefined): number {
  const parsed = Number(value ?? 60_000);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 300_000 ? parsed : 60_000;
}

const webhookUrl = process.env.WEBHOOK_URL?.trim() || undefined;

export const config = {
  port: readPort(process.env.PORT),
  webhookUrl,
  webhookSecret: process.env.WEBHOOK_SECRET?.trim() || undefined,
  webhookTimeoutMs: readTimeout(process.env.WEBHOOK_TIMEOUT_MS),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.trim() || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

if (!config.webhookUrl) {
  console.warn(
    '[XYZ] Brak WEBHOOK_URL. Ustaw adres w pliku .env, aby włączyć odpowiedzi agenta.',
  );
}
