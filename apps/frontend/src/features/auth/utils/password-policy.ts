/**
 * Single source of truth for the client-side password policy.
 *
 * `validatePassword` and `scorePassword` below encode the same rules as the
 * server regex (8–128 chars, one lowercase, one uppercase, one digit, one
 * special character from the allowed set). They MUST stay in sync with the
 * server-side policy enforced in
 * `apps/auth-service/src/application/utils/password-policy.ts`. If the two
 * drift, the strength meter can show "Strong" for a password the backend
 * rejects (or vice-versa), which is a confusing UX bug.
 */

const SPECIAL_CHAR_REGEX = /[@$!%*?&\-_#^()]/;

/**
 * Returns the i18n key (under `features.auth.password_policy`) describing the
 * first unmet requirement, or `null` when the password satisfies the full
 * policy. Returning a key rather than an English string keeps this util
 * framework-agnostic and lets each form translate the reason.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "too_short";
  if (!/[A-Z]/.test(password)) return "no_uppercase";
  if (!/[a-z]/.test(password)) return "no_lowercase";
  if (!/\d/.test(password)) return "no_number";
  if (!SPECIAL_CHAR_REGEX.test(password)) return "no_special";
  if (password.length > 128) return "too_long";
  return null;
}

export type PasswordRequirementKey =
  | "length"
  | "uppercase"
  | "lowercase"
  | "number"
  | "special";

export interface PasswordRequirement {
  /** i18n label key under `features.auth.password_policy.requirements`. */
  key: PasswordRequirementKey;
  /** Whether the current password satisfies this rule. */
  met: boolean;
}

/**
 * Returns every policy rule with its current met/unmet state, so the UI can
 * show the user a live checklist of exactly what a valid password must include.
 * The order matches the order the rules are described to the user.
 */
export function getPasswordRequirements(
  password: string,
): PasswordRequirement[] {
  return [
    { key: "length", met: password.length >= 8 && password.length <= 128 },
    { key: "uppercase", met: /[A-Z]/.test(password) },
    { key: "lowercase", met: /[a-z]/.test(password) },
    { key: "number", met: /\d/.test(password) },
    { key: "special", met: SPECIAL_CHAR_REGEX.test(password) },
  ];
}

export type PasswordStrengthLabel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  /** Number of satisfied dimensions, 0–4 — also the count of filled bar segments. */
  score: 0 | 1 | 2 | 3 | 4;
  /** i18n label key under `features.auth.password_policy.strength`. */
  labelKey: PasswordStrengthLabel;
  /** Tailwind background class for the filled bar segments. */
  barColor: string;
  /** Tailwind text colour class for the label. */
  textColor: string;
}

/**
 * Scores a password across the same four dimensions the server enforces, so the
 * meter feedback maps exactly to what the backend will accept. Returns `null`
 * for an empty password so the meter can render nothing.
 */
export function scorePassword(password: string): PasswordStrength | null {
  if (password.length === 0) return null;

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (SPECIAL_CHAR_REGEX.test(password)) score++;

  const levels: PasswordStrength[] = [
    {
      score: 0,
      labelKey: "weak",
      barColor: "bg-red-500",
      textColor: "text-red-500",
    },
    {
      score: 1,
      labelKey: "weak",
      barColor: "bg-red-500",
      textColor: "text-red-500",
    },
    {
      score: 2,
      labelKey: "fair",
      barColor: "bg-orange-400",
      textColor: "text-orange-500",
    },
    {
      score: 3,
      labelKey: "good",
      barColor: "bg-yellow-400",
      textColor: "text-yellow-600",
    },
    {
      score: 4,
      labelKey: "strong",
      barColor: "bg-green-500",
      textColor: "text-green-600",
    },
  ];

  return { ...levels[score], score: score as PasswordStrength["score"] };
}
