export interface ReactionProps {
  emoji: string;
  userId: string;
  createdAt: Date;
}

export interface ReplyToProps {
  messageId: string;
  senderId: string;
  content: string;
}

export interface MessageProps {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  status: string;
  isDeleted: boolean;
  isEdited: boolean;
  reactions?: ReactionProps[];
  replyTo?: ReplyToProps;
  isAI?: boolean;
  toolUsed?: string | null;
  agentQuery?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MessageEntity {
  constructor(private readonly props: MessageProps) {}

  get id() {
    return this.props.id;
  }
  get conversationId() {
    return this.props.conversationId;
  }
  get senderId() {
    return this.props.senderId;
  }
  get content() {
    return this.props.content;
  }
  get type() {
    return this.props.type;
  }
  get status() {
    return this.props.status;
  }
  get isDeleted() {
    return this.props.isDeleted;
  }
  get isEdited() {
    return this.props.isEdited;
  }
  get reactions(): ReactionProps[] {
    return this.props.reactions ?? [];
  }
  get replyTo(): ReplyToProps | undefined {
    return this.props.replyTo;
  }
  get isAI(): boolean {
    return this.props.isAI ?? false;
  }
  get toolUsed(): string | null | undefined {
    return this.props.toolUsed;
  }
  get agentQuery(): string | null | undefined {
    return this.props.agentQuery;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  static create(props: MessageProps): MessageEntity {
    return new MessageEntity(props);
  }
}
