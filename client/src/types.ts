export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface ConversationMessage {
  role: MessageRole;
  content: string;
}

export interface ChatResponse {
  reply: string;
  conversationId: string;
}
