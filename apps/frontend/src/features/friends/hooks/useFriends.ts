import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  friendsService,
  FriendRequest,
  UserProfile,
  UserSearchResult,
} from "../services/friends.service";
import { showToast } from "../../../shared/utils/toast";

export const useFriends = () => {
  return useQuery({
    queryKey: ["friends"],
    queryFn: () => friendsService.getFriends(),
  });
};

export const useIncomingRequests = () => {
  return useQuery({
    queryKey: ["friend-requests", "incoming"],
    queryFn: () => friendsService.getIncomingRequests(),
  });
};

export const useRecommendations = () => {
  return useQuery({
    queryKey: ["friend-recommendations"],
    queryFn: () => friendsService.getRecommendations(),
  });
};

export const useRemoveFriend = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (friendId: string) => friendsService.removeFriend(friendId),

    onMutate: async (friendId) => {
      await queryClient.cancelQueries({ queryKey: ["friends"] });
      const previousFriends = queryClient.getQueryData<UserProfile[]>([
        "friends",
      ]);
      if (previousFriends) {
        queryClient.setQueryData(
          ["friends"],
          previousFriends.filter((f) => f.id !== friendId),
        );
      }
      return { previousFriends };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousFriends) {
        queryClient.setQueryData(["friends"], context.previousFriends);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friend-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useSearchUsers = (query: string) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  return useQuery<UserSearchResult[]>({
    queryKey: ["user-search", debouncedQuery],
    queryFn: () => friendsService.searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });
};

export const useSendFriendRequest = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("features.friends");

  return useMutation({
    mutationFn: (receiverId: string) =>
      friendsService.sendFriendRequest(receiverId),

    // Optimistic Update
    onMutate: async (receiverId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["friend-requests", "outgoing"],
      });
      await queryClient.cancelQueries({ queryKey: ["friend-recommendations"] });
      await queryClient.cancelQueries({ queryKey: ["user-search"] });

      // Snapshot the previous values
      const previousOutgoing = queryClient.getQueryData<FriendRequest[]>([
        "friend-requests",
        "outgoing",
      ]);
      const previousRecommendations = queryClient.getQueryData<UserProfile[]>([
        "friend-recommendations",
      ]);
      const previousSearchQueries = queryClient.getQueriesData<
        UserSearchResult[]
      >({ queryKey: ["user-search"] });

      // Optimistically remove from recommendations
      if (previousRecommendations) {
        queryClient.setQueryData(
          ["friend-recommendations"],
          previousRecommendations.filter((u) => u.id !== receiverId),
        );
      }

      // Optimistically mark as pending_outgoing in search results
      queryClient.setQueriesData<UserSearchResult[]>(
        { queryKey: ["user-search"], exact: false },
        (old) =>
          old?.map((u) =>
            u.id === receiverId
              ? { ...u, relationshipStatus: "pending_outgoing" as const }
              : u,
          ) ?? old,
      );

      return {
        previousOutgoing,
        previousRecommendations,
        previousSearchQueries,
      };
    },

    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previousOutgoing) {
        queryClient.setQueryData(
          ["friend-requests", "outgoing"],
          context.previousOutgoing,
        );
      }
      if (context?.previousRecommendations) {
        queryClient.setQueryData(
          ["friend-recommendations"],
          context.previousRecommendations,
        );
      }
      for (const [queryKey, data] of context?.previousSearchQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      const message = err.response?.data?.message ?? "Failed to send friend request";
      showToast.error(t("errors.send_request_failed"), message);
    },

    // Always refetch after error or success:
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["friend-requests", "outgoing"],
      });
      queryClient.invalidateQueries({
        queryKey: ["friend-requests", "incoming"],
      });
      queryClient.invalidateQueries({ queryKey: ["friend-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["user-search"] });
    },
  });
};

export const useRespondToRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      action,
    }: {
      requestId: string;
      action: "ACCEPT" | "REJECT";
    }) => friendsService.respondToRequest(requestId, action),

    // Optimistic Update
    onMutate: async ({ requestId, action }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["friend-requests", "incoming"],
      });
      await queryClient.cancelQueries({ queryKey: ["friends"] });

      // Snapshot the previous value
      const previousRequests = queryClient.getQueryData<FriendRequest[]>([
        "friend-requests",
        "incoming",
      ]);
      const previousFriends = queryClient.getQueryData<UserProfile[]>([
        "friends",
      ]);

      // Optimistically update to the new value
      if (previousRequests) {
        const respondingRequest = previousRequests.find(
          (r) => r.id === requestId,
        );
        queryClient.setQueryData(
          ["friend-requests", "incoming"],
          previousRequests.filter((r) => r.id !== requestId),
        );

        if (
          action === "ACCEPT" &&
          respondingRequest &&
          respondingRequest.sender
        ) {
          queryClient.setQueryData(
            ["friends"],
            [...(previousFriends || []), respondingRequest.sender],
          );
        }
      }

      return { previousRequests, previousFriends };
    },

    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (_err, _variables, context) => {
      if (context?.previousRequests) {
        queryClient.setQueryData(
          ["friend-requests", "incoming"],
          context.previousRequests,
        );
      }
      if (context?.previousFriends) {
        queryClient.setQueryData(["friends"], context.previousFriends);
      }
    },

    // Always refetch after error or success:
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["friend-requests", "incoming"],
      });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friend-recommendations"] });
    },
  });
};
