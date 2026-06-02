'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { authService } from '../services/auth.service';
import { showToast } from '../../../shared/utils/toast';
import { CheckCircle, XCircle, Clock, ArrowRight, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export const VerifyEmail = () => {
  const t = useTranslations('features.auth.verify_email');
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('error.invalid_link'));
      showToast.error(t('error.invalid_link_title'), t('error.link_missing'));
      return;
    }

    const verifyEmail = async () => {
      try {
        await authService.verifyEmail(token);
        setStatus('success');
        setMessage(t('success.message'));
        showToast.success(t('success.toast_title'), t('success.toast_desc'));
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } catch (err: unknown) {
        setStatus('error');
        const errorMessage = err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message: string } } }).response?.data?.message
          : err instanceof Error ? err.message : t('error.generic_error');
        setMessage(errorMessage);
        showToast.error(t('error.toast_title'), errorMessage);
      }
    };

    verifyEmail();
  }, [token, router, t]);

  if (!mounted) return null;

  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in fade-in slide-up duration-500">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          {status === 'loading' && (
            <>
              <div className="bg-gradient-to-r from-primary to-blue-600 p-8 text-center">
                <div className="flex justify-center mb-4">
                  <Clock className="w-16 h-16 text-white animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-white">{t('loading.title')}</h2>
              </div>
              <div className="p-8 text-center">
                <p className="text-foreground/70 mb-4">{t('loading.message')}</p>
                <div className="flex justify-center gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
                <div className="flex justify-center mb-4">
                  <CheckCircle className="w-16 h-16 text-white animate-bounce" />
                </div>
                <h2 className="text-2xl font-bold text-white">{t('success.title')}</h2>
              </div>
              <div className="p-8 text-center">
                <p className="text-foreground/70 mb-2">{t('success.message')}</p>
                <p className="text-sm text-foreground/60 mb-8">{t('success.instruction')}</p>
                <button
                  onClick={() => router.push('/login')}
                  className="w-full py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 font-medium"
                >
                  {t('success.button')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="bg-gradient-to-r from-destructive to-red-600 p-8 text-center">
                <div className="flex justify-center mb-4">
                  <XCircle className="w-16 h-16 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">{t('error.title')}</h2>
              </div>
              <div className="p-8 text-center">
                <p className="text-foreground/70 mb-2">{t('error.message')}</p>
                <p className="text-sm text-foreground/60 mb-8">{message}</p>
                <div className="space-y-3">
                  <button
                    onClick={() => router.push('/signup')}
                    className="w-full py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 font-medium"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('error.button_retry')}
                  </button>
                  <button
                    onClick={() => router.push('/login')}
                    className="w-full py-3 border-2 border-primary text-primary rounded-lg hover:bg-secondary transition-all duration-300 font-medium"
                  >
                    {t('error.button_login')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
