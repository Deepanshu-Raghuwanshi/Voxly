import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { LoggerModule } from "nestjs-pino";
import { createLoggerConfig } from "@shared-logger";
import { TerminusModule } from "@nestjs/terminus";
import { ThrottlerModule } from "@nestjs/throttler";
import { validate } from "./config/env.validation";
import { HealthController } from "./interfaces/controllers/health.controller";
import { ChatModule } from "./chat.module";
import { RedisModule } from "./infrastructure/cache/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri:
          config.get<string>("MONGODB_URL") || "mongodb://localhost:27017/chat",
      }),
    }),
    LoggerModule.forRoot(createLoggerConfig()),
    TerminusModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
    RedisModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
