export const BOT_QUEUE = 'bot-messages';

export interface BotJobData {
  tenantId: string;
  conversationId: string;
  message: { body: string; direction: string; is_private: boolean };
}
