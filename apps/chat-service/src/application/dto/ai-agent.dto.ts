import { IsString, IsMongoId, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AiAgentDto {
  @ApiProperty({
    description: "The conversation to post the AI reply into",
  })
  @IsMongoId()
  conversationId!: string;

  @ApiProperty({
    description: 'Full user message starting with "@AI"',
    minLength: 4,
    maxLength: 510,
  })
  @IsString()
  @MinLength(4)
  @MaxLength(510)
  message!: string;
}
