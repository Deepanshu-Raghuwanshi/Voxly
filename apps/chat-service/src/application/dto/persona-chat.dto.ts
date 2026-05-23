import { IsString, IsIn, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PERSONA_IDS, PersonaId } from "@shared-utils";

export class PersonaChatDto {
  @ApiProperty({ enum: PERSONA_IDS, description: "Target persona" })
  @IsString()
  @IsIn(PERSONA_IDS)
  personaId!: PersonaId;

  @ApiProperty({ minLength: 1, maxLength: 600, description: "User message" })
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  message!: string;
}
