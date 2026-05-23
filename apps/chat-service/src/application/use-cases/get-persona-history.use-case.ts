import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { PersonaId, isValidPersonaId } from "@shared-utils";
import {
  PersonaMessageRepository,
  PersonaMessageDoc,
} from "../ports/persona-message.repository";

@Injectable()
export class GetPersonaHistoryUseCase {
  constructor(
    @Inject("PersonaMessageRepository")
    private readonly personaMessageRepo: PersonaMessageRepository,
  ) {}

  async execute(
    userId: string,
    personaId: string,
  ): Promise<{ personaId: PersonaId; messages: PersonaMessageDoc[] }> {
    if (!isValidPersonaId(personaId)) {
      throw new BadRequestException(`Invalid personaId: ${personaId}`);
    }
    const messages = await this.personaMessageRepo.findByUserAndPersona(
      userId,
      personaId,
      50,
    );
    return { personaId, messages };
  }
}
