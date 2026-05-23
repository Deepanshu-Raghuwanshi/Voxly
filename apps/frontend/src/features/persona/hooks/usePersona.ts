"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { PersonaId, PERSONAS } from "@shared-utils";
import { personaService } from "../services/persona.service";
import { usePersonaStore } from "../store/usePersonaStore";
import { showToast } from "../../../shared/utils/toast";
import { PersonaMessageItem } from "../types";

export const usePersonaHistory = (personaId: PersonaId) => {
  const setMessages = usePersonaStore((s) => s.setMessages);

  return useQuery({
    queryKey: ["persona-history", personaId],
    queryFn: async () => {
      const data = await personaService.getHistory(personaId);
      setMessages(personaId, data.messages);
      return data;
    },
    staleTime: Infinity,
    retry: false,
  });
};

export const usePersonaChat = (personaId: PersonaId) => {
  const persona = PERSONAS[personaId];
  const appendMessage = usePersonaStore((s) => s.appendMessage);
  const setLoading = usePersonaStore((s) => s.setLoading);
  const setRateLimit = usePersonaStore((s) => s.setRateLimit);
  const setDraft = usePersonaStore((s) => s.setDraft);

  return useMutation({
    mutationFn: (message: string) =>
      personaService.chat({ personaId, message }),

    onMutate: (message) => {
      setLoading(personaId, true);
      const userMsg: PersonaMessageItem = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: message,
        toolUsed: null,
        createdAt: new Date().toISOString(),
      };
      appendMessage(personaId, userMsg);
      setDraft("");
    },

    onSettled: () => {
      setLoading(personaId, false);
    },

    onSuccess: (data) => {
      const aiMsg: PersonaMessageItem = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        toolUsed: data.toolUsed,
        createdAt: new Date().toISOString(),
      };
      appendMessage(personaId, aiMsg);
    },

    onError: (err) => {
      if (!axios.isAxiosError(err)) {
        appendMessage(personaId, {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `${persona.name} is unavailable right now, try again in a moment`,
          toolUsed: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const status = err.response?.status;
      const data = err.response?.data as Record<string, unknown> | undefined;
      const msg = (data?.message as string | undefined) ?? "";

      if (status === 429) {
        const secondsRemaining =
          (data?.secondsRemaining as number | undefined) ?? 0;
        setRateLimit(personaId, {
          blocked: true,
          secondsLeft: secondsRemaining,
        });
        showToast.error(msg || "Please wait before sending another message");
        if (secondsRemaining > 0) {
          setTimeout(() => {
            setRateLimit(personaId, { blocked: false, secondsLeft: 0 });
          }, secondsRemaining * 1000);
        }
        return;
      }

      if (status === 400 && msg) {
        appendMessage(personaId, {
          id: `blocked-${Date.now()}`,
          role: "assistant",
          content: msg,
          toolUsed: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      appendMessage(personaId, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `${persona.name} is unavailable right now, try again in a moment`,
        toolUsed: null,
        createdAt: new Date().toISOString(),
      });
    },
  });
};

export const useClearPersonaHistory = (personaId: PersonaId) => {
  const queryClient = useQueryClient();
  const clearMessages = usePersonaStore((s) => s.clearMessages);

  return useMutation({
    mutationFn: () => personaService.clearHistory(personaId),
    onSuccess: () => {
      clearMessages(personaId);
      queryClient.removeQueries({ queryKey: ["persona-history", personaId] });
    },
  });
};
