import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithIntl } from "../utils/render";
import type { Conversation } from "@shared-types";

// Stub child components — we only care about the state wiring in ConversationView
vi.mock("../../src/features/chat/components/ConversationHeader", () => ({
  ConversationHeader: ({ onSummarize }: { onSummarize: () => void }) => (
    <button data-testid="summarize-btn" onClick={onSummarize}>
      Summarize
    </button>
  ),
}));

vi.mock("../../src/features/chat/components/MessageList", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

vi.mock("../../src/features/chat/components/SmartReplyChips", () => ({
  SmartReplyChips: () => null,
}));

vi.mock("../../src/features/chat/components/AiThinkingIndicator", () => ({
  AiThinkingIndicator: () => null,
}));

vi.mock("../../src/features/chat/components/MessageComposer", () => ({
  MessageComposer: () => null,
}));

vi.mock("../../src/features/chat/components/SummaryModal", () => ({
  SummaryModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog">
        <button data-testid="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock("../../src/features/chat/hooks/useChat", () => ({
  useConversation: vi.fn(),
  useMessages: vi.fn(),
  useMarkRead: vi.fn(),
  useSummarizeConversation: vi.fn(),
}));

vi.mock("../../src/features/friends/hooks/usePresence", () => ({
  usePresence: vi.fn(),
  joinConversationRoom: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

import {
  useConversation,
  useMessages,
  useMarkRead,
  useSummarizeConversation,
} from "../../src/features/chat/hooks/useChat";
import { ConversationView } from "../../src/features/chat/components/ConversationView";

const mockConversation: Conversation = {
  id: "conv-1",
  participants: [],
  unreadCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ConversationView — summarize state wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useConversation).mockReturnValue({
      data: mockConversation,
      isLoading: false,
    } as ReturnType<typeof useConversation>);

    vi.mocked(useMessages).mockReturnValue({
      data: {
        pages: [{ data: [], hasMore: false, nextCursor: undefined }],
        pageParams: [undefined],
      },
      isLoading: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useMessages>);

    vi.mocked(useMarkRead).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useMarkRead>);
  });

  it("opens the modal and calls summarize(50) when the summarize button is clicked", () => {
    const summarize = vi.fn();
    vi.mocked(useSummarizeConversation).mockReturnValue({
      mutate: summarize,
      isPending: false,
      data: undefined,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSummarizeConversation>);

    renderWithIntl(<ConversationView conversationId="conv-1" />);

    fireEvent.click(screen.getByTestId("summarize-btn"));

    expect(summarize).toHaveBeenCalledWith(50);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("calls reset and closes the modal when handleSummaryClose is invoked", () => {
    const reset = vi.fn();
    vi.mocked(useSummarizeConversation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      data: undefined,
      isError: false,
      reset,
    } as unknown as ReturnType<typeof useSummarizeConversation>);

    renderWithIntl(<ConversationView conversationId="conv-1" />);

    // Open the modal
    fireEvent.click(screen.getByTestId("summarize-btn"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Close the modal via its onClose callback
    fireEvent.click(screen.getByTestId("modal-close-btn"));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
