export type MessageRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  role: MessageRole;
  content: string;
}

export interface ChatRequest {
  message: string;
  conversationId: string;
  messages: ConversationMessage[];
}

export interface ChatResponse {
  reply: string;
  conversationId: string;
}
