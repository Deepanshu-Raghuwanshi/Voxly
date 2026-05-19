export interface ReactionView {
  emoji: string;
  userId: string;
  createdAt: string;
}

export interface ReplyToView {
  messageId: string;
  senderId: string;
  content: string;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  status: string;
  isDeleted: boolean;
  isEdited?: boolean;
  isAI: boolean;
  toolUsed?: string | null;
  reactions: ReactionView[];
  replyTo?: ReplyToView;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantView {
  userId: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastReadAt?: string;
}

export interface ConversationView {
  id: string;
  participants: ParticipantView[];
  lastMessage?: MessageView;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListView {
  data: ConversationView[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface MessageListView {
  data: MessageView[];
  hasMore: boolean;
  nextCursor?: string;
}
