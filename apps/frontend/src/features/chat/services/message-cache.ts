import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Message, MessageListResponse } from "@shared-types";

export function mergeRealtimeMessage(queryClient: QueryClient, message: Message) {
  const key = ["messages", message.conversationId];
  const cache = queryClient.getQueryCache();
  const query = cache.find({ queryKey: key, exact: true });
  if (!query) return;

  let pendingFetch: Promise<unknown> | undefined;
  const merge = () => {
    if (cache.get(query.queryHash) !== query) return;

    // A history response can have taken its snapshot before this message arrived.
    // Wait for it to land so replacing the pages can't drop the socket event.
    if (query.state.fetchStatus !== "idle" && query.promise && query.promise !== pendingFetch) {
      pendingFetch = query.promise;
      void pendingFetch.then(merge, merge);
      return;
    }

    queryClient.setQueryData<InfiniteData<MessageListResponse>>(key, (history) => {
      const firstPage = history?.pages[0];
      if (!history || !firstPage) return history;
      if (history.pages.some((page) => page.data.some(({ id }) => id === message.id))) {
        return history;
      }

      const data = [message, ...firstPage.data];
      data.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return {
        ...history,
        pages: [{ ...firstPage, data }, ...history.pages.slice(1)],
      };
    });
  };

  merge();
}
