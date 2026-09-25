# Agent kontrahentów XYZ

Prosta aplikacja do rozmowy z agentem AI firmy XYZ. Frontend jest zbudowany w React + Vite + TypeScript, a backend w Node.js + Express. Backend przyjmuje wiadomość, przekazuje ją do webhooka n8n i czeka na odpowiedź, która jest wyświetlana w czacie.

## Uruchomienie lokalne

Wymagany jest Node.js 20 lub nowszy.

1. Zainstaluj zależności:

   ```bash
   npm install
   ```

2. Skopiuj konfigurację:

   ```bash
   cp .env.example .env
   ```

   Na systemie Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Uzupełnij w `.env` adres webhooka n8n:

   ```env
   WEBHOOK_URL=https://twoja-instancja.n8n.cloud/webhook/xyz-agent
   ```

   Jeśli workflow jest chroniony sekretem, ustaw też `WEBHOOK_SECRET`. Backend wyśle go w nagłówku `x-webhook-secret`.

4. Uruchom aplikację:

   ```bash
   npm run dev
   ```

   Frontend będzie dostępny pod `http://localhost:5173`, a API pod `http://localhost:3001`.

## Workflow n8n

Workflow powinien odbierać wiadomość w polu `message`. Aplikacja wysyła również `conversationId`, pełną historię rozmowy w `messages` oraz `timestamp`, dzięki czemu agent może prowadzić kontekst rozmowy.

Najprostsza odpowiedź webhooka:

```json
{
  "reply": "Dziękuję! W czym mogę pomóc?"
}
```

Aplikacja akceptuje również popularne odpowiedzi n8n, np. `response`, `answer`, `text`, `output`, `data` lub tablicę elementów z odpowiedzią. Najbezpieczniej użyć pola `reply`.

Przykład payloadu, który otrzymuje n8n:

```json
{
  "message": "Czym zajmuje się firma XYZ?",
  "conversationId": "conversation-abc",
  "messages": [
    { "role": "user", "content": "Czym zajmuje się firma XYZ?" }
  ],
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

## Build i produkcja

```bash
npm run build
npm start
```

Po buildzie backend Express serwuje frontend z katalogu `client/dist`. Aplikacja będzie dostępna pod adresem ustawionym przez zmienną `PORT` (domyślnie `http://localhost:3001`).

## API

- `GET /api/health` — status usługi i informacja, czy webhook jest skonfigurowany.
- `POST /api/chat` — przyjmuje `{ message, conversationId?, messages? }` i zwraca `{ reply, conversationId }`.
