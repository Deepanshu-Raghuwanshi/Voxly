import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { AiThinkingIndicator } from "../../src/features/chat/components/AiThinkingIndicator";
import { renderWithIntl } from "../utils/render";
import { useChatStore } from "../../src/features/chat/store/useChatStore";

describe("AiThinkingIndicator", () => {
  beforeEach(() => {
    useChatStore.setState({ typingUsers: {} });
  });

  it("is not visible when typingUsers for the conversation does not include AI", () => {
    useChatStore.setState({ typingUsers: { "conv-1": ["user-2"] } });
    renderWithIntl(<AiThinkingIndicator conversationId="conv-1" />);
    expect(screen.queryByText(/AI is thinking/)).toBeNull();
  });

  it("is not visible when typingUsers for the conversation is empty", () => {
    useChatStore.setState({ typingUsers: { "conv-1": [] } });
    renderWithIntl(<AiThinkingIndicator conversationId="conv-1" />);
    expect(screen.queryByText(/AI is thinking/)).toBeNull();
  });

  it("is not visible when there are no typingUsers entries for the conversation", () => {
    renderWithIntl(<AiThinkingIndicator conversationId="conv-unknown" />);
    expect(screen.queryByText(/AI is thinking/)).toBeNull();
  });

  it("renders the thinking indicator when typingUsers includes AI", () => {
    useChatStore.setState({ typingUsers: { "conv-1": ["AI"] } });
    renderWithIntl(<AiThinkingIndicator conversationId="conv-1" />);
    expect(screen.getByText("🤖 AI is thinking")).toBeTruthy();
  });

  it("renders animated dots when AI is thinking", () => {
    useChatStore.setState({ typingUsers: { "conv-1": ["AI"] } });
    const { container } = renderWithIntl(
      <AiThinkingIndicator conversationId="conv-1" />,
    );
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots.length).toBe(3);
  });
});
