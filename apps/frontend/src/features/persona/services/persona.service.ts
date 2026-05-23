import apiClient from "../../../shared/lib/apiClient";
import { PersonaChatResponse, PersonaHistoryResponse } from "../types";

export const personaService = {
  async chat(dto: {
    personaId: string;
    message: string;
  }): Promise<PersonaChatResponse> {
    const { data } = await apiClient.post<PersonaChatResponse>(
      "/chat/persona/chat",
      dto,
    );
    return data;
  },

  async getHistory(personaId: string): Promise<PersonaHistoryResponse> {
    const { data } = await apiClient.get<PersonaHistoryResponse>(
      `/chat/persona/history/${personaId}`,
    );
    return data;
  },

  async clearHistory(personaId: string): Promise<{ deleted: number }> {
    const { data } = await apiClient.delete<{ deleted: number }>(
      `/chat/persona/history/${personaId}`,
    );
    return data;
  },
};
