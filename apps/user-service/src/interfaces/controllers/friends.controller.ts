import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  Header,
} from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Request } from "express";
import { JwtAuthGuard } from "../../infrastructure/guards/jwt-auth.guard";
import { SendFriendRequestUseCase } from "../../application/use-cases/send-friend-request.use-case";
import { RespondToFriendRequestUseCase } from "../../application/use-cases/respond-to-friend-request.use-case";
import { GetFriendsUseCase } from "../../application/use-cases/get-friends.use-case";
import { GetFriendsPresenceUseCase } from "../../application/use-cases/get-friends-presence.use-case";
import { GetIncomingRequestsUseCase } from "../../application/use-cases/get-incoming-requests.use-case";
import { GetOutgoingRequestsUseCase } from "../../application/use-cases/get-outgoing-requests.use-case";
import { GetRecommendationsUseCase } from "../../application/use-cases/get-recommendations.use-case";
import { SearchUsersUseCase } from "../../application/use-cases/search-users.use-case";
import { RemoveFriendUseCase } from "../../application/use-cases/remove-friend.use-case";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@Controller("friends")
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(
    private readonly sendFriendRequestUseCase: SendFriendRequestUseCase,
    private readonly respondToFriendRequestUseCase: RespondToFriendRequestUseCase,
    private readonly getFriendsUseCase: GetFriendsUseCase,
    private readonly getIncomingRequestsUseCase: GetIncomingRequestsUseCase,
    private readonly getOutgoingRequestsUseCase: GetOutgoingRequestsUseCase,
    private readonly getRecommendationsUseCase: GetRecommendationsUseCase,
    private readonly searchUsersUseCase: SearchUsersUseCase,
    private readonly removeFriendUseCase: RemoveFriendUseCase,
    private readonly getFriendsPresenceUseCase: GetFriendsPresenceUseCase,
  ) {}

  @Get("search")
  @ApiOperation({ summary: "Search users by username or full name" })
  @ApiResponse({
    status: 200,
    description:
      "List of matching user profiles (excludes current user, friends, and pending requests)",
  })
  @ApiResponse({ status: 400, description: "Query too short or missing" })
  async searchUsers(
    @Req() req: AuthenticatedRequest,
    @Query("q") query: string | undefined,
  ) {
    return this.searchUsersUseCase.execute(req.user.id, query);
  }

  @Get()
  async getFriends(@Req() req: AuthenticatedRequest) {
    return this.getFriendsUseCase.execute(req.user.id);
  }

  @Get("presence")
  @Header("Cache-Control", "no-store")
  async getPresence(
    @Req() req: AuthenticatedRequest,
    @Query("ids") ids: string | undefined,
  ) {
    const userIds = typeof ids === "string" ? ids.split(",") : [];
    if (
      userIds.length === 0 ||
      userIds.length > 100 ||
      userIds.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))
    ) {
      throw new BadRequestException(
        "Provide 1 to 100 comma-separated user IDs",
      );
    }

    return this.getFriendsPresenceUseCase.execute(req.user.id, [
      ...new Set(userIds),
    ]);
  }

  @Delete(":friendId")
  async removeFriend(
    @Req() req: AuthenticatedRequest,
    @Param("friendId") friendId: string,
  ) {
    return this.removeFriendUseCase.execute(req.user.id, friendId);
  }

  @Get("recommendations")
  async getRecommendations(@Req() req: AuthenticatedRequest) {
    return this.getRecommendationsUseCase.execute(req.user.id);
  }

  @Get("requests/incoming")
  async getIncomingRequests(@Req() req: AuthenticatedRequest) {
    return this.getIncomingRequestsUseCase.execute(req.user.id);
  }

  @Get("requests/outgoing")
  async getOutgoingRequests(@Req() req: AuthenticatedRequest) {
    return this.getOutgoingRequestsUseCase.execute(req.user.id);
  }

  @Post("requests")
  async sendRequest(
    @Req() req: AuthenticatedRequest,
    @Body() body: { receiverId: string },
  ) {
    return this.sendFriendRequestUseCase.execute({
      senderId: req.user.id,
      receiverId: body.receiverId,
    });
  }

  @Post("requests/:requestId/respond")
  async respondToRequest(
    @Req() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Body() body: { action: "ACCEPT" | "REJECT" },
  ) {
    return this.respondToFriendRequestUseCase.execute({
      requestId,
      userId: req.user.id,
      action: body.action,
    });
  }
}
