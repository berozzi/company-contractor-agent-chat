export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface ChatResponse {
  reply: string;
  sessionID?: string;
  conversationId?: string;
}
