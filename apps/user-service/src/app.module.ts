import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { TerminusModule } from "@nestjs/terminus";
import { PassportModule } from "@nestjs/passport";
import { validate } from "./config/env.validation";
import { HealthController } from "./interfaces/controllers/health.controller";
import { FriendsController } from "./interfaces/controllers/friends.controller";
import { UserController } from "./interfaces/controllers/user.controller";
import { PrismaService } from "./infrastructure/persistence/prisma.service";
import { PrismaHealthIndicator } from "./infrastructure/persistence/prisma.health";
import { UserEventsConsumer } from "./infrastructure/messaging/user-events.consumer";
import { KafkaProducerService } from "./infrastructure/messaging/kafka-producer.service";
import { PrismaFriendRequestRepository } from "./infrastructure/persistence/prisma-friend-request.repository";
import { PrismaFriendshipRepository } from "./infrastructure/persistence/prisma-friendship.repository";
import { PrismaUserProfileRepository } from "./infrastructure/persistence/prisma-user-profile.repository";
import { RedisPresenceRepository } from "./infrastructure/cache/redis-presence.repository";
import { CloudinaryService } from "./infrastructure/cloudinary/cloudinary.service";
import { SendFriendRequestUseCase } from "./application/use-cases/send-friend-request.use-case";
import { RespondToFriendRequestUseCase } from "./application/use-cases/respond-to-friend-request.use-case";
import { GetFriendsUseCase } from "./application/use-cases/get-friends.use-case";
import { GetFriendsPresenceUseCase } from "./application/use-cases/get-friends-presence.use-case";
import { GetIncomingRequestsUseCase } from "./application/use-cases/get-incoming-requests.use-case";
import { GetOutgoingRequestsUseCase } from "./application/use-cases/get-outgoing-requests.use-case";
import { GetRecommendationsUseCase } from "./application/use-cases/get-recommendations.use-case";
import { SearchUsersUseCase } from "./application/use-cases/search-users.use-case";
import { RemoveFriendUseCase } from "./application/use-cases/remove-friend.use-case";
import { GetProfileUseCase } from "./application/use-cases/get-profile.use-case";
import { UpdateProfileUseCase } from "./application/use-cases/update-profile.use-case";
import { UpdateAvatarUseCase } from "./application/use-cases/update-avatar.use-case";
import { JwtStrategy } from "./infrastructure/strategies/jwt.strategy";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== "production" ? "debug" : "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty" }
            : undefined,
      },
    }),
    TerminusModule,
    PassportModule,
  ],
  controllers: [HealthController, FriendsController, UserController],
  providers: [
    PrismaService,
    PrismaHealthIndicator,
    UserEventsConsumer,
    KafkaProducerService,
    JwtStrategy,
    {
      provide: "FriendRequestRepository",
      useClass: PrismaFriendRequestRepository,
    },
    {
      provide: "FriendshipRepository",
      useClass: PrismaFriendshipRepository,
    },
    {
      provide: "UserProfileRepository",
      useClass: PrismaUserProfileRepository,
    },
    {
      provide: "PresenceRepository",
      useClass: RedisPresenceRepository,
    },
    CloudinaryService,
    SendFriendRequestUseCase,
    RespondToFriendRequestUseCase,
    GetFriendsUseCase,
    GetFriendsPresenceUseCase,
    GetIncomingRequestsUseCase,
    GetOutgoingRequestsUseCase,
    GetRecommendationsUseCase,
    SearchUsersUseCase,
    RemoveFriendUseCase,
    GetProfileUseCase,
    UpdateProfileUseCase,
    UpdateAvatarUseCase,
  ],
})
export class AppModule {}
