'use client';

import { isAxiosError } from 'axios';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Spinner } from '../../../shared/components/ui/spinner';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/useAuthStore';
import { isProtectedRoute } from '../utils/session-routes';

export function SessionBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('features.auth.session');
  const tCommon = useTranslations('common.buttons');
  const checked = useAuthStore((state) => state.hasCheckedSession);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const protectedRoute = isProtectedRoute(pathname);
  const requiresCheck = protectedRoute || pathname === '/';
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<number>();

  useEffect(() => {
    try {
      localStorage.removeItem('auth-storage');
    } catch {
      // Browsers may disallow storage.
    }
  }, []);

  useEffect(() => {
    if (!requiresCheck || checked) return;

    const controller = new AbortController();
    void authService.getProfile(controller.signal).then((user) => {
      if (!controller.signal.aborted && !useAuthStore.getState().hasCheckedSession) {
        useAuthStore.getState().setUser(user);
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted || useAuthStore.getState().hasCheckedSession) return;
      if (isAxiosError(error) && error.response?.status === 401) {
        useAuthStore.getState().logout();
      } else {
        setFailedAttempt(attempt);
      }
    });
    return () => controller.abort();
  }, [attempt, checked, requiresCheck]);

  useEffect(() => {
    if (protectedRoute && checked && !authenticated) {
      const redirect = pathname + window.location.search + window.location.hash;
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
    }
  }, [authenticated, checked, pathname, protectedRoute, router]);

  if (requiresCheck && !checked && failedAttempt === attempt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p role="alert">{t('failed')}</p>
        <button className="text-primary hover:underline" onClick={() => setAttempt(attempt + 1)}>
          {tCommon('retry')}
        </button>
      </div>
    );
  }
  if ((requiresCheck && !checked) || (protectedRoute && !authenticated)) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-2">
        <Spinner aria-hidden="true" className="h-6 w-6" />
        <span>{t('checking')}</span>
      </div>
    );
  }

  return children;
}
