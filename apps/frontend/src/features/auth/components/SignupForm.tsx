'use client';

import React, { useState, useEffect } from 'react';
import { useSignup, useResendVerification } from '../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { showToast } from '../../../shared/utils/toast';
import { Eye, EyeOff, Mail, Lock, CheckCircle, ArrowRight } from 'lucide-react';
import { Spinner } from '../../../shared/components/ui/spinner';
import { useTranslations } from 'next-intl';

export const SignupForm = () => {
  const t = useTranslations('features.auth.signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const router = useRouter();
  const { mutate: signup, isPending, isSuccess, error: signupError } = useSignup();
  const { mutate: resendVerification, isPending: isResending } = useResendVerification();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isSuccess) {
      showToast.success(t('toasts.account_created'), t('toasts.verification_sent', { email }));
      setResendCooldown(60);
      setCanResend(false);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isSuccess, email, t]);

  useEffect(() => {
    if (signupError) {
      const errorMsg = signupError && typeof signupError === 'object' && 'response' in signupError
        ? (signupError as { response: { data: { message: string } } }).response?.data?.message
        : signupError instanceof Error ? signupError.message : t('toasts.signup_failed');
      showToast.error(t('toasts.signup_failed'), errorMsg);
    }
  }, [signupError, t]);

  const handleResend = () => {
    resendVerification(email, {
      onSuccess: () => {
        showToast.success(t('toasts.account_created'), t('success.resend_success'));
        setResendCooldown(60);
        setCanResend(false);
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(timer); setCanResend(true); return 0; }
            return prev - 1;
          });
        }, 1000);
      },
    });
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast.error(t('errors.password_mismatch_title'), t('errors.password_mismatch'));
      return;
    }
    if (password.length < 6) {
      showToast.error(t('errors.weak_password_title'), t('errors.weak_password'));
      return;
    }
    signup({ email, password });
  };

  if (!mounted) return null;

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="w-120 max-w-130 animate-in slide-up duration-500">
          <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-blue-600 p-6 text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle className="w-16 h-16 text-white animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold text-white">{t('success.title')}</h2>
            </div>
            <div className="p-8 text-center">
              <p className="text-foreground/70 mb-2">{t('success.sent_to')}</p>
              <p className="text-lg font-semibold text-primary mb-6 break-all">{email}</p>
              <p className="text-sm text-foreground/60 mb-8">
                {t('success.instruction')}
              </p>
              <button
                onClick={() => router.push('/login')}
                className="w-full py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 font-medium"
              >
                {t('success.go_to_login')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-sm text-foreground/60 mt-4">
                {t('success.resend_prompt')}{' '}
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-primary font-semibold hover:underline disabled:opacity-50"
                  >
                    {isResending ? t('success.resend_sending') : t('success.resend_button')}
                  </button>
                ) : (
                  <span className="text-foreground/40">{t('success.resend_cooldown', { seconds: resendCooldown })}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-120 max-w-130 animate-in fade-in slide-up duration-500">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-blue-600 p-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">{t('title')}</h1>
            <p className="text-blue-100">{t('subtitle')}</p>
          </div>

          <div className="p-8">
            <form onSubmit={handleSignup} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-semibold text-foreground">{t('email_label')}</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3.5 w-5 h-5 text-foreground/40 group-focus-within:text-primary transition-colors" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('email_placeholder')}
                    className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 bg-background text-foreground"
                    required
                    disabled={isPending}
                  />
                </div>
              </div>

              {/* Password Field */}
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
                    className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 bg-background text-foreground"
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

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-foreground">{t('confirm_password_label')}</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3.5 w-5 h-5 text-foreground/40 group-focus-within:text-primary transition-colors" />
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('confirm_password_placeholder')}
                    className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 bg-background text-foreground"
                    required
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-3 text-foreground/40 hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 bg-gradient-to-r from-primary to-blue-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold flex items-center justify-center gap-2 mt-6"
              >
                {isPending ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    {t('creating_account')}
                  </>
                ) : (
                  <>
                    {t('create_account')}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Sign In Link */}
            <p className="text-center text-sm text-foreground/60 mt-6">
              {t('already_have_account')}{' '}
              <button
                onClick={() => router.push('/login')}
                className="text-primary font-semibold hover:underline transition-colors"
              >
                {t('sign_in')}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
