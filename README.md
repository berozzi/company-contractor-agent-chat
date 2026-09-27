# Agent kontrahentów XYZ

Prosty czat z agentem AI firmy XYZ. Frontend: React + Vite + TypeScript. Backend: Node.js + Express.

## Uruchomienie

Wymagany jest Node.js 20 lub nowszy.

```bash
npm install
npm run dev
```

Adres webhooka jest ustawiony w `.env`:

```env
WEBHOOK_URL=https://primary-production-56b7.up.railway.app/webhook/52df2fc4-1a28-447e-9800-297621090ce5/chat
PORT=3001
```

Frontend działa pod `http://localhost:5173`, a backend pod `http://localhost:3001`.

## Webhook n8n

Backend wysyła na webhook JSON w formacie wymaganym przez n8n Chat Trigger:

```json
{
  "action": "sendMessage",
  "chatInput": "Treść pytania",
  "sessionId": "identyfikator-sesji",
  "sessionID": "identyfikator-sesji"
}
```

`sessionId` jest polem wymaganym przez n8n, a `sessionID` jest dodatkowym aliasem. Identyfikator jest zachowywany między kolejnymi pytaniami w tej samej rozmowie. Backend czeka na odpowiedź workflow i zwraca ją do frontendu. Akceptuje odpowiedzi n8n w polach `reply`, `response`, `answer`, `text`, `content`, `output`, `data` lub `message`, a także zwykły tekst.

## Build

```bash
npm run build
npm start
```

Po zbudowaniu backend serwuje frontend z katalogu `client/dist`.

## Wdrożenie na Vercel

Najprościej wdrożyć to repo jako **dwa projekty Vercel z tego samego GitHuba**.

### 1. Backend

- **Root Directory:** `server`
- **Framework:** Express
- **Node.js:** 20 lub nowszy
- Zmienne środowiskowe:
  - `WEBHOOK_URL` — adres Chat URL n8n
  - `FRONTEND_URL` — opcjonalnie adres frontendu; przy kilku adresach rozdziel je przecinkami

### 2. Frontend

- **Root Directory:** `client`
- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- Zmienna środowiskowa:
  - `VITE_API_URL=https://<nazwa-projektu-backend>.vercel.app/api`

`VITE_API_URL` jest zmienną publiczną i musi być ustawiona przed buildem. `WEBHOOK_URL` ustawia się wyłącznie w projekcie backendu i nigdy nie należy dodawać go do frontendu.

Nie trzeba ustawiać `PORT` na Vercelu — platforma dostarcza go automatycznie.
