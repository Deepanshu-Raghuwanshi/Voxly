'use client';

import Link from 'next/link';
import { useAuthStore } from '../src/features/auth/store/useAuthStore';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const t = useTranslations('features.home');

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/chat');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return null; // Or a loading spinner
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background">
      <h1 className="text-4xl font-bold text-primary mb-4">{t('title')}</h1>
      <p className="text-xl text-muted-foreground mb-8 max-w-lg">
        {t('description')}
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition font-semibold shadow-md"
        >
          {t('buttons.login')}
        </Link>
        <Link
          href="/signup"
          className="px-6 py-2 border border-primary text-primary rounded-md hover:bg-primary/10 transition font-semibold"
        >
          {t('buttons.signup')}
        </Link>
      </div>
    </main>
  );
}
