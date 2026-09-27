import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Domyślnie Vite wstrzykuje tylko zmienne z prefiksem VITE_.
  // Dodajemy API_URL, żeby adres backendu dało się ustawić na Vercelu.
  envPrefix: ['VITE_', 'API_URL'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
