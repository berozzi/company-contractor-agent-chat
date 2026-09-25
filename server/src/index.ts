import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, () => {
  console.log(`[XYZ] Backend działa na http://localhost:${config.port}`);
  console.log(`[XYZ] Webhook n8n: ${config.webhookUrl ? 'skonfigurowany' : 'brak konfiguracji'}`);
});

const shutdown = (signal: string) => {
  console.log(`[XYZ] Otrzymano ${signal}, zamykam serwer...`);
  server.close(() => process.exit(0));
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
