export * as AuthTypes from "./v1/auth.types";
export * as UserTypes from "./v1/user.types";
export * as ChatTypes from "./v1/chat.types";

import { components as authComponents } from "./v1/auth.types";
import { components as userComponents } from "./v1/user.types";
import { components as chatComponents } from "./v1/chat.types";

// Export specific schemas for easier use
export type LoginDto = authComponents["schemas"]["LoginDto"];
export type RegisterDto = authComponents["schemas"]["RegisterDto"];
export type AuthResponse = authComponents["schemas"]["AuthResponse"];

export type UserProfile = userComponents["schemas"]["UserProfile"];

export type Conversation = chatComponents["schemas"]["Conversation"];
export type ConversationParticipant =
  chatComponents["schemas"]["ConversationParticipant"];
export type ConversationListResponse =
  chatComponents["schemas"]["ConversationListResponse"];
export type Message = chatComponents["schemas"]["Message"];
export type MessageListResponse =
  chatComponents["schemas"]["MessageListResponse"];
export type CreateConversationDto =
  chatComponents["schemas"]["CreateConversationDto"];
export type SendMessageDto = chatComponents["schemas"]["SendMessageDto"];
export type EditMessageDto = chatComponents["schemas"]["EditMessageDto"];
export type Reaction = chatComponents["schemas"]["Reaction"];
export type ToggleReactionDto = chatComponents["schemas"]["ToggleReactionDto"];
export type QuotedMessage = chatComponents["schemas"]["QuotedMessage"];
export type AiRewriteDto = chatComponents["schemas"]["AiRewriteDto"];
export type AiRewriteResponse = chatComponents["schemas"]["AiRewriteResponse"];
export type MessageContextItem =
  chatComponents["schemas"]["MessageContextItem"];
export type AiSmartReplyDto = chatComponents["schemas"]["AiSmartReplyDto"];
export type AiSmartReplyResponse =
  chatComponents["schemas"]["AiSmartReplyResponse"];
export type AiSummarizeDto = chatComponents["schemas"]["AiSummarizeDto"];
export type AiSummarizeResponse =
  chatComponents["schemas"]["AiSummarizeResponse"];
export type AiAgentDto = chatComponents["schemas"]["AiAgentDto"];
export type AiAgentResponse = chatComponents["schemas"]["AiAgentResponse"];
export type AiAgentBlockedResponse =
  chatComponents["schemas"]["AiAgentBlockedResponse"];
export type AiAgentRateLimitedResponse =
  chatComponents["schemas"]["AiAgentRateLimitedResponse"];
