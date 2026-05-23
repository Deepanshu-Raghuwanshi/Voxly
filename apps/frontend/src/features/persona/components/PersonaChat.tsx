"use client";

import React, { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PersonaId, PERSONAS } from "@shared-utils";
import { cn } from "../../../shared/utils/cn";
import { usePersonaStore } from "../store/usePersonaStore";
import {
  usePersonaHistory,
  usePersonaChat,
  useClearPersonaHistory,
} from "../hooks/usePersona";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { PersonaThinkingIndicator } from "./PersonaThinkingIndicator";
import { StarterQuestionChips } from "./StarterQuestionChips";
import { ArrowLeft, RotateCcw, Send } from "lucide-react";

interface PersonaChatProps {
  personaId: PersonaId;
  onBack: () => void;
}

export const PersonaChat = ({ personaId, onBack }: PersonaChatProps) => {
  const t = useTranslations("features.persona");
  const persona = PERSONAS[personaId];
  const messages = usePersonaStore((s) => s.messages[personaId] ?? []);
  const loading = usePersonaStore((s) => s.loading[personaId] ?? false);
  const rateLimit = usePersonaStore((s) => s.rateLimit[personaId]);
  const draft = usePersonaStore((s) => s.draft);
  const setDraft = usePersonaStore((s) => s.setDraft);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    isLoading: historyLoading,
    isError: historyError,
    refetch,
  } = usePersonaHistory(personaId);
  const chatMutation = usePersonaChat(personaId);
  const clearMutation = useClearPersonaHistory(personaId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || loading || rateLimit.blocked) return;
    chatMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card/80 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          aria-label={t("back_label")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${persona.colorHex}20` }}
        >
          {persona.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {persona.name}
            </span>
            {persona.useWebSearch && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: persona.colorHex }}
                />
                {t("powered_by_web_search")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {persona.role}
          </p>
        </div>
        <button
          type="button"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          aria-label={t("new_conversation_label")}
          title={t("new_conversation_label")}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {persona.disclaimer && (
        <DisclaimerBanner
          text={persona.disclaimer}
          colorHex={persona.colorHex}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {historyLoading && (
          <div className="text-center text-sm text-muted-foreground">
            {t("history_loading")}
          </div>
        )}
        {historyError && (
          <div className="text-center" role="alert">
            <p className="text-sm text-muted-foreground mb-2">
              {t("errors.history_load_failed")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm underline text-primary"
            >
              {t("errors.history_retry")}
            </button>
          </div>
        )}

        {isEmpty && !historyError && (
          <StarterQuestionChips
            persona={persona}
            onSelect={(q) => {
              setDraft(q);
              inputRef.current?.focus();
            }}
          />
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "assistant" && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 mt-1"
                style={{ backgroundColor: `${persona.colorHex}20` }}
              >
                {persona.emoji}
              </div>
            )}
            <div className="flex flex-col gap-1 max-w-[75%]">
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border rounded-bl-sm",
                )}
                style={
                  msg.role === "assistant"
                    ? { borderColor: `${persona.colorHex}30` }
                    : {}
                }
              >
                {msg.content}
              </div>
              {msg.role === "assistant" && msg.toolUsed && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  {msg.toolUsed === "web_search"
                    ? t("searched_web")
                    : t("from_knowledge")}
                </span>
              )}
              {msg.role === "assistant" && persona.disclaimer && (
                <span className="text-[10px] text-muted-foreground ml-1 italic">
                  {persona.disclaimer}
                </span>
              )}
            </div>
          </div>
        ))}

        <PersonaThinkingIndicator personaId={personaId} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/80 backdrop-blur-md shrink-0">
        {rateLimit.blocked && (
          <p className="text-xs text-amber-600 mb-2 text-center">
            {t("rate_limit_wait", { seconds: rateLimit.secondsLeft })}
          </p>
        )}
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              `input_placeholder_${personaId}` as Parameters<typeof t>[0],
            )}
            rows={2}
            maxLength={600}
            className={cn(
              "flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3",
              "text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2",
              "focus:ring-primary/30 transition-all",
            )}
            disabled={loading || rateLimit.blocked}
            aria-label={persona.inputPlaceholder}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || loading || rateLimit.blocked}
            className={cn(
              "p-3 rounded-xl text-white transition-all",
              !draft.trim() || loading || rateLimit.blocked
                ? "opacity-40 cursor-not-allowed"
                : "hover:opacity-90",
            )}
            style={{ backgroundColor: persona.colorHex }}
            aria-label={t("send_message_label")}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-right text-[10px] text-muted-foreground mt-1">
          {draft.length}/600
        </p>
      </div>
    </div>
  );
};
