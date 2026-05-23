import { create } from "zustand";
import { PersonaId, PERSONA_IDS } from "@shared-utils";
import { PersonaMessageItem } from "../types";

interface RateLimitState {
  blocked: boolean;
  secondsLeft: number;
}

interface PersonaState {
  selectedPersonaId: PersonaId | null;
  messages: Record<PersonaId, PersonaMessageItem[]>;
  loading: Record<PersonaId, boolean>;
  rateLimit: Record<PersonaId, RateLimitState>;
  draft: string;

  selectPersona: (id: PersonaId | null) => void;
  setMessages: (personaId: PersonaId, msgs: PersonaMessageItem[]) => void;
  appendMessage: (personaId: PersonaId, msg: PersonaMessageItem) => void;
  setLoading: (personaId: PersonaId, loading: boolean) => void;
  setRateLimit: (personaId: PersonaId, rl: RateLimitState) => void;
  setDraft: (text: string) => void;
  clearMessages: (personaId: PersonaId) => void;
}

const defaultRateLimit: RateLimitState = { blocked: false, secondsLeft: 0 };

const emptyMessages = PERSONA_IDS.reduce(
  (acc, id) => ({ ...acc, [id]: [] }),
  {} as Record<PersonaId, PersonaMessageItem[]>,
);

const emptyLoading = PERSONA_IDS.reduce(
  (acc, id) => ({ ...acc, [id]: false }),
  {} as Record<PersonaId, boolean>,
);

const emptyRateLimit = PERSONA_IDS.reduce(
  (acc, id) => ({ ...acc, [id]: defaultRateLimit }),
  {} as Record<PersonaId, RateLimitState>,
);

export const usePersonaStore = create<PersonaState>((set) => ({
  selectedPersonaId: null,
  messages: emptyMessages,
  loading: emptyLoading,
  rateLimit: emptyRateLimit,
  draft: "",

  selectPersona: (id) => set({ selectedPersonaId: id, draft: "" }),
  setMessages: (personaId, msgs) =>
    set((state) => ({ messages: { ...state.messages, [personaId]: msgs } })),
  appendMessage: (personaId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [personaId]: [...(state.messages[personaId] ?? []), msg],
      },
    })),
  setLoading: (personaId, loading) =>
    set((state) => ({ loading: { ...state.loading, [personaId]: loading } })),
  setRateLimit: (personaId, rl) =>
    set((state) => ({ rateLimit: { ...state.rateLimit, [personaId]: rl } })),
  setDraft: (draft) => set({ draft }),
  clearMessages: (personaId) =>
    set((state) => ({
      messages: { ...state.messages, [personaId]: [] },
    })),
}));
