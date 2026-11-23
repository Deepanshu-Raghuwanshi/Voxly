'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { useEffect, useState } from 'react';
import { setupInterceptors } from '../../features/auth/services/refresh.interceptor';
import { useAuthStore } from '../../features/auth/store/useAuthStore';
import { useChatStore } from '../../features/chat/store/useChatStore';

export default function TanstackProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  // Initialize interceptors
  useState(() => {
    setupInterceptors();
  });

  useEffect(() => useAuthStore.subscribe((current, previous) => {
    if (previous.user && previous.user.id !== current.user?.id) {
      queryClient.clear();
      useChatStore.setState(useChatStore.getInitialState());
    }
  }), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="bottom-right" />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
