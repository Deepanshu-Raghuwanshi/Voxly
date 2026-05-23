'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useResetPassword } from '../hooks/useAuth';
import { showToast } from '../../../shared/utils/toast';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Spinner } from '../../../shared/components/ui/spinner';
import { useTranslations } from 'next-intl';

export const ResetPasswordForm = () => {
  const t = useTranslations('features.auth.reset_password');
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const { mutate: resetPasswordMutation, isPending } = useResetPassword();

  useEffect(() => {
    if (!token) {
      showToast.error(t('errors.invalid_link'), t('errors.no_token'));
      router.push('/login');
    }
  }, [token, router, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      showToast.error(t('errors.password_mismatch_title'), t('errors.password_mismatch'));
      return;
    }

    if (password.length < 8) {
      showToast.error(t('errors.weak_password_title'), t('errors.weak_password'));
      return;
    }

    if (token) {
      resetPasswordMutation(
        { token, password },
        {
          onSuccess: () => {
            setIsSuccess(true);
            showToast.success(t('success.toast_title'), t('success.toast_desc'));
            setTimeout(() => router.push('/login'), 3000);
          },
          onError: (error: unknown) => {
            const msg = error && typeof error === 'object' && 'response' in error
              ? (error as { response: { data: { message: string } } }).response?.data?.message
              : error instanceof Error ? error.message : t('errors.failed');
            showToast.error(t('common.errors.error'), msg);
          }
        }
      );
    }
  };

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card p-8 rounded-2xl shadow-xl border border-border text-center animate-in fade-in zoom-in duration-500">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('success.title')}</h2>
          <p className="text-foreground/60 mb-6">
            {t('success.message')}
          </p>
          <p className="text-sm text-primary animate-pulse">{t('success.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl shadow-xl border border-border animate-in fade-in slide-up duration-500">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
          <p className="text-foreground/60">{t('subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-foreground">{t('password_label')}</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-3.5 w-5 h-5 text-foreground/40 group-focus-within:text-primary transition-colors" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password_placeholder')}
                className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 bg-background"
                required
                disabled={isPending}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-foreground/40 hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-foreground">{t('confirm_password_label')}</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-3.5 w-5 h-5 text-foreground/40 group-focus-within:text-primary transition-colors" />
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirm_password_placeholder')}
                className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 bg-background"
                required
                disabled={isPending}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <Spinner className="w-4 h-4" />
                {t('submitting')}
              </>
            ) : (
              t('submit')
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
