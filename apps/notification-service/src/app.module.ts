import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from '@shared-logger';
import { TerminusModule } from '@nestjs/terminus';
import { validate } from './config/env.validation';
import { HealthController } from './interfaces/controllers/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    LoggerModule.forRoot(createLoggerConfig()),
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
