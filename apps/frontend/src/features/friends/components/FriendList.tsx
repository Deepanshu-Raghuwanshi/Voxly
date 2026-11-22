"use client";

import React from "react";
import {
  useFriends,
  useIncomingRequests,
  useRespondToRequest,
  useRecommendations,
  useSendFriendRequest,
  useRemoveFriend,
} from "../hooks/useFriends";
import { FriendCard } from "./FriendCard";
import { RecommendationList } from "./RecommendationList";
import { UserSearchPanel } from "./UserSearchPanel";
import { Users, UserPlus } from "lucide-react";
import { Spinner } from "../../../shared/components/ui/spinner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCreateConversation } from "../../chat/hooks/useChat";
import { useAuthStore } from "../../auth/store/useAuthStore";

interface FriendListProps {
  activeTab: "friends" | "requests" | "search";
}

export const FriendList = ({ activeTab }: FriendListProps) => {
  const t = useTranslations("features.friends");
  const tSub = useTranslations("features.sub_navbar.friends");
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);


  const { data: friends, isLoading: isLoadingFriends } = useFriends();
  const { data: requests, isLoading: isLoadingRequests } =
    useIncomingRequests();
  const { data: recommendations, isLoading: isLoadingRecs } =
    useRecommendations();
  const { mutate: respondToRequest } = useRespondToRequest();
  const { mutate: sendRequest } = useSendFriendRequest();
  const { mutate: removeFriend } = useRemoveFriend();
  const { mutate: createConversation } = useCreateConversation();

  const handleMessage = (friend: {
    id: string;
    username?: string;
    fullName?: string;
    avatarUrl?: string;
  }) => {
    createConversation(
      {
        targetUserId: friend.id,
        targetUsername: friend.username,
        targetFullName: friend.fullName,
        targetAvatarUrl: friend.avatarUrl,
        callerUsername: currentUser?.username,
        callerFullName: currentUser?.fullName,
        callerAvatarUrl: currentUser?.avatarUrl,
      },
      {
        onSuccess: (conversation) => {
          router.push(`/chat/${conversation.id}`);
        },
      },
    );
  };

  if (
    (isLoadingFriends || isLoadingRequests || isLoadingRecs) &&
    activeTab !== "search"
  ) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (activeTab === "search") {
    return (
      <div className="max-w-4xl mx-auto p-6 pb-20">
        <UserSearchPanel onSendRequest={(id) => sendRequest(id)} />
      </div>
    );
  }

  const showRequests = activeTab === "requests";
  const hasRequests = requests && requests.length > 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-12 pb-20">
      {showRequests ? (
        <>
          {/* Incoming Requests Section */}
          {hasRequests ? (
            <section className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">
                  {t("sections.incoming_requests")}
                </h2>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full">
                  {requests.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requests.map((request) => (
                  <FriendCard
                    key={request.id}
                    userId={request.senderId}
                    username={request.sender?.username}
                    fullName={request.sender?.fullName}
                    avatarUrl={request.sender?.avatarUrl}
                    isIncomingRequest
                    onAccept={() =>
                      respondToRequest({
                        requestId: request.id,
                        action: "ACCEPT",
                      })
                    }
                    onReject={() =>
                      respondToRequest({
                        requestId: request.id,
                        action: "REJECT",
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="text-center p-12 bg-muted/40 rounded-2xl border-2 border-dashed border-border">
              <UserPlus className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                {tSub("no_requests")}
              </p>
            </div>
          )}

          {/* Show Recommendations if no requests, as per requirement */}
          {!hasRequests && (
            <RecommendationList
              recommendations={recommendations}
              onSendRequest={(userId) => sendRequest(userId)}
            />
          )}
        </>
      ) : (
        <>
          {/* Friends Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">
                {t("sections.friends")}
              </h2>
              {friends && friends.length > 0 && (
                <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-bold rounded-full">
                  {friends.length}
                </span>
              )}
            </div>

            {friends && friends.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map((friend) => (
                  <FriendCard
                    key={friend.id}
                    userId={friend.id}
                    username={friend.username}
                    fullName={friend.fullName}
                    avatarUrl={friend.avatarUrl}
                    isOnline={friend.isOnline}
                    onMessage={() => handleMessage(friend)}
                    onRemove={() => removeFriend(friend.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center p-12 bg-muted/40 rounded-2xl border-2 border-dashed border-border">
                <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">
                  {t("placeholders.no_friends")}
                </p>
              </div>
            )}
          </section>

          {/* Recommendations Section */}
          <RecommendationList
            recommendations={recommendations}
            onSendRequest={(userId) => sendRequest(userId)}
          />
        </>
      )}
    </div>
  );
};
