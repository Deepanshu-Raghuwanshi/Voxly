import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { isValidPersonaId } from "@shared-utils";
import { PersonaMessageRepository } from "../ports/persona-message.repository";

@Injectable()
export class ClearPersonaHistoryUseCase {
  constructor(
    @Inject("PersonaMessageRepository")
    private readonly personaMessageRepo: PersonaMessageRepository,
  ) {}

  async execute(
    userId: string,
    personaId: string,
  ): Promise<{ deleted: number }> {
    if (!isValidPersonaId(personaId)) {
      throw new BadRequestException(`Invalid personaId: ${personaId}`);
    }
    const deleted = await this.personaMessageRepo.deleteByUserAndPersona(
      userId,
      personaId,
    );
    return { deleted };
  }
}
