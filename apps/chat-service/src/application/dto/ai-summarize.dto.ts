import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AiSummarizeDto {
  @ApiProperty({
    description: "ID of the conversation to summarize",
  })
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @ApiPropertyOptional({
    description: "Number of most-recent non-deleted messages to include",
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
