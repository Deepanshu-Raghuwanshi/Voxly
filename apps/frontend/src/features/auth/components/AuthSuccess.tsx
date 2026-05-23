'use client';

import React, { useEffect } from 'react';
import { useRefresh } from '../hooks/useAuth';
import { Spinner } from '../../../shared/components/ui/spinner';
import { useTranslations } from 'next-intl';

export const AuthSuccess = () => {
  const t = useTranslations('features.auth.auth_success');
  const { mutate: refresh } = useRefresh();

  useEffect(() => {
    // Small delay to ensure cookies are set by the browser
    const timer = setTimeout(() => {
      refresh();
    }, 500);
    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondary">
      <div className="bg-card p-8 rounded-2xl shadow-xl border border-border flex flex-col items-center gap-4 animate-in fade-in duration-500">
        <Spinner className="w-10 h-10 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        <p className="text-foreground/60">{t('message')}</p>
      </div>
    </div>
  );
};
