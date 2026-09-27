import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

import { ApiError, getHealth, isApiConfigured, sendChatMessage } from './api';
import type { ChatMessage } from './types';

const MAX_INPUT_LENGTH = 10_000;

const welcomeMessage: ChatMessage = {
  id: 'welcome-message',
  role: 'assistant',
  content:
    'Cześć! 👋 Jestem agentem firmy XYZ. Odpowiem na pytania dotyczące współpracy, oferty i procesu realizacji zleceń. W czym mogę pomóc?',
  createdAt: new Date().toISOString(),
};

type ConnectionState = 'checking' | 'ready' | 'unavailable' | 'misconfigured';

const misconfiguredMessage =
  'Frontend nie zna adresu backendu. Ustaw zmienną API_URL w projekcie Vercel z rootem client, ' +
  'np. https://<projekt-backend>.vercel.app, i zrób redeploy.';

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon icon-sparkle">
      <path d="m12 2 1.55 6.45L20 10l-6.45 1.55L12 18l-1.55-6.45L4 10l6.45-1.55L12 2Z" />
      <path d="m19 16 .65 2.35L22 19l-2.35.65L19 22l-.65-2.35L16 19l2.35-.65L19 16Z" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon icon-small">
      <path d="M20 11a8.1 8.1 0 0 0-14.8-3.8L3 10" />
      <path d="M3 5v5h5" />
      <path d="M4 13a8.1 8.1 0 0 0 14.8 3.8L21 14" />
      <path d="M21 19v-5h-5" />
    </svg>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <article className={`message-row ${isUser ? 'message-row-user' : ''}`}>
      {!isUser && (
        <div className="message-avatar" aria-hidden="true">
          <SparkleIcon />
        </div>
      )}
      <div className="message-stack">
        <div className={`message-meta ${isUser ? 'message-meta-user' : ''}`}>
          <span>{isUser ? 'Ty' : 'Agent XYZ'}</span>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </div>
        <div className={`message-bubble ${isUser ? 'message-bubble-user' : ''}`}>
          {message.content}
        </div>
      </div>
      {isUser && <div className="message-avatar user-avatar" aria-hidden="true">T</div>}
    </article>
  );
}

function LoadingMessage() {
  return (
    <article className="message-row">
      <div className="message-avatar" aria-hidden="true">
        <SparkleIcon />
      </div>
      <div className="message-stack">
        <div className="message-meta">
          <span>Agent XYZ</span>
        </div>
        <div className="message-bubble message-bubble-loading" aria-label="Agent pisze odpowiedź">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      </div>
    </article>
  );
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [conversationId] = useState(() => createMessageId());
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;

    getHealth()
      .then((data) => {
        if (active) {
          setConnectionState(data.webhookConfigured ? 'ready' : 'unavailable');
        }
      })
      .catch((healthError: unknown) => {
        if (!active) {
          return;
        }

        if (import.meta.env.PROD && !isApiConfigured) {
          setConnectionState('misconfigured');
          setError(misconfiguredMessage);
          return;
        }

        setConnectionState('unavailable');
        setError(
          healthError instanceof Error
            ? `Nie udało się połączyć z backendem: ${healthError.message}`
            : 'Nie udało się połączyć z backendem.',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  useEffect(() => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    inputElement.style.height = 'auto';
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 160)}px`;
  }, [input]);

  async function sendMessage(rawMessage: string, existingMessageId?: string) {
    const message = rawMessage.trim();
    if (!message || isSending) {
      return;
    }

    const userMessage: ChatMessage = existingMessageId
      ? messages.find((item) => item.id === existingMessageId) ?? {
          id: existingMessageId,
          role: 'user',
          content: message,
          createdAt: new Date().toISOString(),
        }
      : {
          id: createMessageId(),
          role: 'user',
          content: message,
          createdAt: new Date().toISOString(),
        };

    const history = existingMessageId ? messages : [...messages, userMessage];

    if (!existingMessageId) {
      setMessages(history);
    }

    setInput('');
    setError(null);
    setFailedMessageId(null);
    setIsSending(true);

    try {
      const result = await sendChatMessage({
        message: userMessage.content,
        sessionID: conversationId,
        conversationId,
      });

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: 'assistant',
          content: result.reply.trim(),
          createdAt: new Date().toISOString(),
        },
      ]);
      setConnectionState('ready');
    } catch (requestError) {
      const messageText =
        requestError instanceof ApiError || requestError instanceof Error
          ? requestError.message
          : 'Nie udało się otrzymać odpowiedzi od agenta.';
      setError(messageText);
      setFailedMessageId(userMessage.id);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function handleRetry() {
    if (failedMessageId) {
      const failedMessage = messages.find((item) => item.id === failedMessageId);
      if (failedMessage) {
        void sendMessage(failedMessage.content, failedMessageId);
      }
    }
  }

  const connectionLabel =
    connectionState === 'checking'
      ? 'Sprawdzanie połączenia'
      : connectionState === 'ready'
        ? 'Agent online'
        : connectionState === 'misconfigured'
          ? 'Brak adresu backendu'
          : 'Backend niedostępny';

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <header className="topbar">
        <div className="brand" aria-label="Firma XYZ">
          <span className="brand-mark"><SparkleIcon /></span>
          <span className="brand-name">XYZ</span>
        </div>
        <div className={`connection-pill connection-${connectionState}`} role="status">
          <span className="connection-dot" />
          <span>{connectionLabel}</span>
        </div>
      </header>

      <main className="chat-page">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Agent AI dla kontrahentów firmy XYZ
          </div>
          <h1 id="page-title">
            Twoja współpraca
            <span>zaczyna się tutaj.</span>
          </h1>
          <p className="intro-copy">
            Zadaj pytanie o ofertę, terminy realizacji lub szczegóły współpracy.
            Agent odpowie Ci od razu.
          </p>
        </section>

        <section className="chat-card" aria-label="Rozmowa z agentem XYZ">
          <div className="chat-header">
            <div className="agent-heading">
              <div className="agent-avatar"><SparkleIcon /></div>
              <div>
                <h2>Agent XYZ</h2>
                <p>Asystent dla kontrahentów</p>
              </div>
            </div>
            <div className="secure-label">
              <span className="secure-icon" aria-hidden="true">✓</span>
              Bezpieczna rozmowa
            </div>
          </div>

          <div className="message-list" aria-live="polite" aria-label="Historia wiadomości">
            <div className="date-divider"><span>dzisiaj</span></div>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isSending && <LoadingMessage />}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span className="error-icon" aria-hidden="true">!</span>
              <span className="error-text">{error}</span>
              <button type="button" className="retry-button" onClick={handleRetry} disabled={isSending}>
                <RotateIcon />
                Spróbuj ponownie
              </button>
            </div>
          )}

          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="message-input">Napisz wiadomość do agenta</label>
            <textarea
              ref={inputRef}
              id="message-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Napisz wiadomość..."
              rows={1}
              maxLength={MAX_INPUT_LENGTH}
              disabled={isSending}
              aria-label="Napisz wiadomość do agenta"
            />
            <div className="composer-bottom">
              <span className="input-hint">
                {input.length > 0 ? `${input.length}/${MAX_INPUT_LENGTH}` : 'Enter aby wysłać · Shift + Enter Nowa linia'}
              </span>
              <button
                type="submit"
                className="send-button"
                disabled={!input.trim() || isSending}
                aria-label="Wyślij wiadomość"
              >
                {isSending ? <span className="send-spinner" /> : <ArrowUpIcon />}
              </button>
            </div>
          </form>
          <p className="privacy-note">
            <span aria-hidden="true">⌁</span> Twoje pytania są przetwarzane przez webhook n8n firmy XYZ.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
