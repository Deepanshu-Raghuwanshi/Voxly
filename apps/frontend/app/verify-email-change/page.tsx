'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useProfile } from '../../src/features/profile/hooks/useProfile';
import { Spinner } from '../../src/shared/components/ui/spinner';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

const VerifyEmailChangeContent = () => {
  const t = useTranslations('features.auth.verify_email');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const { verifyEmailChange } = useProfile();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (token && email) {
      verifyEmailChange(
        { token, newEmail: email },
        {
          onSuccess: () => setStatus('success'),
          onError: () => setStatus('error'),
        }
      );
    } else {
      setStatus('error');
    }
  }, [token, email, verifyEmailChange]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl text-center space-y-6">
        {status === 'loading' && (
          <>
            <div className="flex justify-center">
              <Spinner className="w-16 h-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('loading.title')}</h1>
            <p className="text-gray-500">{t('loading.message')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <CheckCircle2 className="w-16 h-16 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('success.title')}</h1>
            <p className="text-gray-500">{t('success.message')}</p>
            <Link
              href="/profile"
              className="block w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-dark transition-colors"
            >
              Back to Profile
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center">
              <XCircle className="w-16 h-16 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('error.title')}</h1>
            <p className="text-gray-500">{t('error.generic_error')}</p>
            <Link
              href="/profile"
              className="block w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Back to Profile
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default function VerifyEmailChangePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailChangeContent />
    </Suspense>
  );
}
