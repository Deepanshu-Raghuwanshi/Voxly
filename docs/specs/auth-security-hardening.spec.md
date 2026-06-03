# Auth Security Hardening Spec

## Password Policy Enforcement + Secure Token Generation

---

## 1. Summary

This spec hardens three distinct security weaknesses in the auth-service and frontend forms:
(1) all security tokens — email verification, password reset, email change, and refresh tokens — are generated with `Math.random()`, which is not cryptographically secure and can be predicted by an attacker who observes enough tokens;
(2) the password minimum is 6 characters on signup but 8 on reset/set, there are no complexity rules, and there is no server-side enforcement — the backend accepts any string as a valid password;
(3) there is no visual password strength feedback on any form.
This spec does **not** add client-side password hashing — that would be a security regression, not an improvement (explained in Section 4).

---

## 2. Current State

**Verified by reading the code. No assumptions.**

### auth-service backend

| File                                                              | Relevant fact                                                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/auth-service/src/application/use-cases/auth.use-cases.ts`   | All four token generators (`generateEmailVerificationToken`, `generatePasswordResetToken`, `changeEmail`, `generateRefreshToken`) use `Math.random().toString(36)`. This is not a CSPRNG. |
| `apps/auth-service/src/application/use-cases/auth.use-cases.ts`   | Passwords are stored with `bcrypt.hash(password, 12)` ✅ — storage is correct.                                                                                                            |
| `apps/auth-service/src/application/use-cases/auth.use-cases.ts`   | There is zero server-side password policy enforcement. Any string, including `"a"`, is accepted.                                                                                          |
| `apps/auth-service/src/interfaces/controllers/auth.controller.ts` | `set-password` and `reset-password` accept raw `{ token: string; password: string }` body — no validation pipe, no length check.                                                          |
| `apps/auth-service/prisma/schema.prisma`                          | `PasswordReset`, `EmailVerification`, `EmailChange`, `RefreshToken` models exist with `token String @unique` — no changes needed to schema.                                               |
| `apps/auth-service/src/app.module.ts`                             | `ThrottlerModule` and `ThrottlerGuard` are already registered globally. Rate-limiting already exists.                                                                                     |

### Frontend

| File                                                               | Relevant fact                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/frontend/src/features/auth/components/SignupForm.tsx`        | Minimum `password.length < 6` only. No complexity rules. No strength meter.                                                 |
| `apps/frontend/src/features/auth/components/ResetPasswordForm.tsx` | Minimum `password.length < 8`. No complexity rules.                                                                         |
| `apps/frontend/src/features/auth/components/SetPasswordForm.tsx`   | Minimum `password.length < 8`. No complexity rules.                                                                         |
| `apps/frontend/src/features/auth/hooks/useAuth.ts`                 | Three separate mutation hooks: `useSignup`, `useResetPassword`, `useSetPassword` — all pass data directly to `authService`. |
| `apps/frontend/src/features/auth/services/auth.service.ts`         | `register`, `resetPassword`, `setPassword` all call `apiClient.post` with the raw credential object.                        |

### What does NOT exist yet

- No CSPRNG-based token generation anywhere in auth-service
- No server-side password policy validator
- No frontend `PasswordStrengthMeter` component
- No shared password policy constant (policy is hardcoded separately in each form)

---

## 3. Desired State

### User-facing behaviour

**Register flow:**

1. User types a password in SignupForm
2. A live strength meter appears below the password input, showing `Weak / Fair / Strong / Very strong` as they type
3. The submit button stays disabled until the password meets the policy
4. On submit, frontend sends `{ email, password }` as JSON over HTTPS (TLS handles transport — no client-side hashing)
5. Backend validates password against the policy server-side; returns `400` with a clear message if it fails
6. If valid, backend hashes with bcrypt(12), creates user, generates a 64-hex-char email verification token using `crypto.randomBytes(32)`, sends verification email

**Reset / Set password flow:**

1. User clicks the email link containing a `?token=<64-hex-char>` query param
2. Same form UI with the same strength meter
3. On submit, backend validates the policy before accepting the new password

**Refresh token flow (no UI change):**

- Refresh token is now generated with `crypto.randomBytes(32).toString('hex')` instead of `Math.random()`

### Data flow

```
Register:
Client → (HTTPS/TLS) → API Gateway → auth-service:
  1. validatePasswordPolicy(password)  → throws 400 if fails
  2. bcrypt.hash(password, 12)         → stored in DB
  3. crypto.randomBytes(32).toString('hex') → EmailVerification token stored in DB
  4. sendVerificationEmail(email, token)

Reset/Set password:
Client → (HTTPS/TLS) → API Gateway → auth-service:
  1. prisma.passwordReset.findUnique({ where: { token } })  → throws 400 if expired
  2. validatePasswordPolicy(password)  → throws 400 if fails
  3. bcrypt.hash(password, 12)         → stored in DB
  4. prisma.passwordReset.delete(...)
```

### Business rules

**Password policy (server-enforced, mirrored on frontend):**

- Minimum 8 characters
- Maximum 128 characters
- Must contain at least one uppercase letter `[A-Z]`
- Must contain at least one lowercase letter `[a-z]`
- Must contain at least one digit `[0-9]`
- Must contain at least one special character from: `@$!%*?&-_#^()`
- Regex: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#^()]).{8,128}$`

**Token security policy:**

- All tokens generated with `crypto.randomBytes(32).toString('hex')` → 64-char hex string, 256 bits of entropy
- `Math.random()` is removed from all token generation paths
- Token expiry windows remain unchanged: verification 24h, password reset 30min, email change 1h, refresh 7d

**Email policy:**

- Email is stored plaintext — required for SMTP delivery; not a vulnerability
- Email is never logged in production (pino is already configured to log at `info` in production — email values are not in log statements)
- No changes needed to email handling

---

## Phase 1 — Contracts & Schema

### 1.1 OpenAPI Changes

Editing `libs/openapi-specs/src/v1/auth.yaml` (not creating a new file — all endpoints belong to the existing auth-service).

Changes made:

- Added `PasswordField` schema with `minLength: 8`, `maxLength: 128`, `pattern` for complexity — reused by `$ref` in `RegisterDto`, `ResetPasswordDto`, `SetPasswordDto`
- Added `format: email` to all email fields
- Added `ErrorResponse` schema
- Added `securitySchemes.cookieAuth`
- Login's password field is intentionally NOT using `PasswordField` — login does not need to enforce the creation policy, only accept whatever the user typed

| Method | Path                        | Auth | Change                                                                 |
| ------ | --------------------------- | ---- | ---------------------------------------------------------------------- |
| POST   | /api/v1/auth/register       | none | `RegisterDto.password` now references `PasswordField` with full policy |
| POST   | /api/v1/auth/reset-password | none | `ResetPasswordDto.password` now references `PasswordField`             |
| POST   | /api/v1/auth/set-password   | none | `SetPasswordDto.password` now references `PasswordField`               |

### 1.2 Database Schema Changes

**None required.** All four token models (`PasswordReset`, `EmailVerification`, `EmailChange`, `RefreshToken`) already store `token String @unique` — the column accepts any string, so switching from 24-char `Math.random()` output to 64-char hex does not require a schema migration.

### 1.3 Kafka Event Contracts

**None.** Token generation and password policy are internal to auth-service. No cross-service events are involved.

### 1.4 Files to Create / Modify in This Phase

```
libs/openapi-specs/src/v1/auth.yaml    — modified (PasswordField schema, error responses, securitySchemes)
```

Commands to run after this phase:

```bash
pnpm generate:types    # Regenerate shared-types — RegisterDto and ResetPasswordDto gain minLength/pattern
```

---

## Phase 2 — Backend Implementation

### 2.1 Domain Layer

No new domain entities needed. This feature adds a validation utility and replaces a token generation utility — no new domain concepts.

### 2.2 Application Layer

#### New utility: `password-policy.ts`

Create `apps/auth-service/src/application/utils/password-policy.ts`:

```typescript
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#^()]).{8,128}$/;

export function validatePasswordPolicy(password: string): void {
  if (!PASSWORD_REGEX.test(password)) {
    throw new BadRequestException(
      "Password must be 8–128 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character (@$!%*?&-_#^()).",
    );
  }
}
```

This is a plain function, not a class — it has no dependencies and doesn't need to be injected. Call it directly in `auth.use-cases.ts`.

#### Modified use cases in `auth.use-cases.ts`

Add `validatePasswordPolicy` call before bcrypt in:

- `register(dto)` — line 45 (before `bcrypt.hash`)
- `setPassword(token, password)` — line 243 (before `bcrypt.hash`)
- `resetPassword(token, password)` — line 286 (before `bcrypt.hash`)

#### Token generation replacement

Replace all `Math.random()` token generators with `crypto.randomBytes(32).toString('hex')`.

Four locations in `auth.use-cases.ts`:

| Method                           | Line | Current                                                         | Replace with                      |
| -------------------------------- | ---- | --------------------------------------------------------------- | --------------------------------- |
| `generateEmailVerificationToken` | ~103 | `Math.random().toString(36).substring(2,15) + Math.random()...` | `randomBytes(32).toString('hex')` |
| `generatePasswordResetToken`     | ~221 | same pattern                                                    | `randomBytes(32).toString('hex')` |
| `changeEmail`                    | ~328 | same pattern                                                    | `randomBytes(32).toString('hex')` |
| `generateRefreshToken`           | ~159 | same pattern                                                    | `randomBytes(32).toString('hex')` |

Add at the top of `auth.use-cases.ts`:

```typescript
import { randomBytes } from "crypto";
```

Node's built-in `crypto` module — no new package needed.

### 2.3 Infrastructure Layer

No repository or Kafka changes. The token column in DB already accepts any string of any length.

**No caching needed** — password validation is pure CPU (regex + bcrypt) with no hot-path lookup.

### 2.4 Interfaces Layer

No new routes. The existing `auth.controller.ts` endpoints stay the same. Validation is enforced in the use case, not the controller.

If you want to add NestJS `class-validator` pipe enforcement at the controller layer as an additional guard (defense in depth), you would add a `@IsStrongPassword()` decorator to a `RegisterDto` class. This is optional — server-side enforcement in the use case is sufficient.

### 2.5 Module Registration

No changes to `AppModule`. The new `password-policy.ts` utility is a plain function, not an injectable service.

### 2.6 Files to Create / Modify in This Phase

```
apps/auth-service/src/application/utils/password-policy.ts           — created
apps/auth-service/src/application/use-cases/auth.use-cases.ts        — modified
  - add: import { randomBytes } from 'crypto'
  - replace: all Math.random() token generators → randomBytes(32).toString('hex')
  - add: validatePasswordPolicy(password) call in register, setPassword, resetPassword
```

### 2.7 Test Cases

**Unit — auth.use-cases.ts** (`apps/auth-service/tests/unit/`):

**Token generation:**

- [ ] `generateEmailVerificationToken`: returned token is exactly 64 characters
- [ ] `generateEmailVerificationToken`: returned token matches `/^[0-9a-f]{64}$/`
- [ ] `generatePasswordResetToken`: same 64-char hex assertion
- [ ] `generateRefreshToken`: same 64-char hex assertion

**Password policy — register:**

- [ ] Happy path: `register({ email: 'a@b.com', password: 'Abcdef1!' })` creates user, calls bcrypt
- [ ] Throws `BadRequestException` when password is `'short1A!'` (7 chars, under minimum)
- [ ] Throws `BadRequestException` when password is `'alllowercase1!'` (no uppercase)
- [ ] Throws `BadRequestException` when password is `'ALLUPPERCASE1!'` (no lowercase)
- [ ] Throws `BadRequestException` when password is `'NoSpecial123'` (no special char)
- [ ] Throws `BadRequestException` when password is `'NoDigit!Abc'` (no digit)
- [ ] Throws `BadRequestException` when password is `'a'.repeat(129) + 'A1!'` (over 128 chars)
- [ ] Does NOT call `bcrypt.hash` when policy validation fails

**Password policy — resetPassword:**

- [ ] Throws `BadRequestException` when token is valid but password fails policy
- [ ] Throws `BadRequestException` when token is expired (existing test, unchanged)
- [ ] Happy path: valid token + strong password → password updated, `PasswordReset` row deleted

**Password policy — setPassword:**

- [ ] Same structure as `resetPassword` tests

```bash
pnpm nx typecheck auth-service
pnpm nx lint auth-service
pnpm nx test auth-service
```

---

## Phase 3 — Frontend Implementation

### 3.1 Routes / Pages

No new routes. Modifying existing form components only.

| Page              | File                                                               | Status   |
| ----------------- | ------------------------------------------------------------------ | -------- |
| `/signup`         | `apps/frontend/src/features/auth/components/SignupForm.tsx`        | modified |
| `/reset-password` | `apps/frontend/src/features/auth/components/ResetPasswordForm.tsx` | modified |
| `/set-password`   | `apps/frontend/src/features/auth/components/SetPasswordForm.tsx`   | modified |

### 3.2 API Service

No changes to `auth.service.ts`. The payload shape is unchanged — `{ email, password }` and `{ token, password }` are correct. TLS handles transport security.

### 3.3 Hooks

No new hooks. Validation is handled in the form components before mutation fires.

### 3.4 Zustand Store Changes

None. Password strength is transient UI state — it lives in the form component via `useState`, not in the store.

### 3.5 Components

#### New component: `PasswordStrengthMeter`

Create `apps/frontend/src/features/auth/components/PasswordStrengthMeter.tsx`.

Props:

```typescript
interface PasswordStrengthMeterProps {
  password: string;
}
```

Strength scoring logic (no external library — pure function):

```typescript
function scorePassword(password: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
  color: string;
} {
  if (password.length === 0) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[@$!%*?&\-_#^()]/.test(password)) score++;

  const levels = [
    { score: 0 as const, label: "Weak", color: "bg-red-500" },
    { score: 1 as const, label: "Fair", color: "bg-orange-400" },
    { score: 2 as const, label: "Good", color: "bg-yellow-400" },
    { score: 3 as const, label: "Strong", color: "bg-green-500" },
  ];

  const clamped = Math.min(score, 3) as 0 | 1 | 2 | 3;
  return levels[clamped];
}
```

Renders: four thin bar segments (filled up to the current score) + label text. Uses Tailwind classes matching existing app style (`bg-border` for empty segments).

#### Modified components

| Component               | Change                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SignupForm.tsx`        | (1) Import and render `<PasswordStrengthMeter password={password} />` below the password input. (2) Replace `password.length < 6` check with full policy validation. (3) Disable submit until `POLICY_REGEX.test(password)`. |
| `ResetPasswordForm.tsx` | Same: add `<PasswordStrengthMeter>` + replace length-only check with full policy check.                                                                                                                                      |
| `SetPasswordForm.tsx`   | Same.                                                                                                                                                                                                                        |

#### Shared policy constant

Create `apps/frontend/src/features/auth/utils/password-policy.ts`:

```typescript
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#^()]).{8,128}$/;

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Must contain a lowercase letter";
  if (!/\d/.test(password)) return "Must contain a number";
  if (!/[@$!%*?&\-_#^()]/.test(password))
    return "Must contain a special character (@$!%*?&-_#^())";
  if (password.length > 128) return "Must be 128 characters or fewer";
  return null;
}
```

Both `SignupForm`, `ResetPasswordForm`, `SetPasswordForm`, and `PasswordStrengthMeter` import from this single source of truth.

### 3.6 Files to Create / Modify in This Phase

```
apps/frontend/src/features/auth/utils/password-policy.ts                    — created
apps/frontend/src/features/auth/components/PasswordStrengthMeter.tsx         — created
apps/frontend/src/features/auth/components/SignupForm.tsx                    — modified
apps/frontend/src/features/auth/components/ResetPasswordForm.tsx             — modified
apps/frontend/src/features/auth/components/SetPasswordForm.tsx               — modified
```

### 3.7 Test Cases

**Component — PasswordStrengthMeter:**

- [ ] Renders nothing (empty) when password is `''`
- [ ] Shows `Weak` when password is `'abc'` (no uppercase, no digit, no special, under 8)
- [ ] Shows `Fair` when password is `'Abcdef1'` (missing special, 7 chars)
- [ ] Shows `Good` when password is `'Abcdef12'` (missing special)
- [ ] Shows `Strong` when password is `'Abcdef1!'` (meets all criteria)

**Component — SignupForm:**

- [ ] Submit button is disabled when `PASSWORD_REGEX.test(password)` is false
- [ ] Submit button is enabled when password meets policy
- [ ] Shows frontend error toast when password is `'short'` (under 8 chars) and submit is attempted
- [ ] Calls `signup` mutation with `{ email, password }` when policy passes

**Component — ResetPasswordForm / SetPasswordForm:**

- [ ] Shows error when password is `'NoSpecial1'` and submit is attempted
- [ ] Calls respective mutation only when policy passes

```bash
pnpm nx typecheck frontend
pnpm nx lint frontend
pnpm nx test frontend
```

---

## 4. Architecture Decisions

| #   | Decision                                                    | Options Considered                                                                                         | Choice                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should passwords be hashed client-side before sending?      | SHA-256 on client, then bcrypt on server / plaintext over TLS + bcrypt on server                           | Plaintext over TLS + bcrypt                                           | Client-side hashing is a vulnerability: the hash becomes the secret, eliminating bcrypt's protection if the DB leaks. TLS already encrypts the transport layer. Every major auth provider (Google, GitHub, Okta, Auth0) sends passwords plaintext over TLS.                                                                                                |
| 2   | CSPRNG library vs Node built-in `crypto`                    | `uuid`, `nanoid`, Node `crypto.randomBytes`                                                                | `crypto.randomBytes(32).toString('hex')`                              | Node's built-in `crypto` is already available — no new dependency. 32 bytes = 256 bits of entropy, brute-forcing is computationally infeasible even with a quantum adversary.                                                                                                                                                                              |
| 3   | Password complexity rules vs NIST length-only               | NIST SP 800-63B (8+ chars, no complexity rules, check breach DB) / Industry common (8+ chars + complexity) | Complexity rules (8+ chars + uppercase + lowercase + digit + special) | NIST 800-63B actually recommends against mandatory composition rules in favor of length + HaveIBeenPwned checks. However, the user explicitly requested complexity enforcement, and it is still the most widely deployed approach in industry (GitHub, Dropbox, Slack all use complexity). HaveIBeenPwned integration is listed as an open question below. |
| 4   | Where to enforce password policy — controller vs use case   | NestJS validation pipe on DTO / inside use case function                                                   | Use case function + shared frontend util                              | The policy is business logic, not transport validation. Enforcing it in the use case keeps the controller thin and ensures the rule applies regardless of how the use case is called. The frontend util mirrors the same regex so users get instant feedback without a round trip.                                                                         |
| 5   | Password strength meter — `zxcvbn` library vs custom scorer | `zxcvbn` (430 KB gzipped) / custom 40-line scorer                                                          | Custom scorer                                                         | `zxcvbn` is accurate but large. The custom scorer uses the same four dimensions as the server policy (length, case, digit, special), giving users feedback that maps exactly to what the backend will accept — no false confidence or confusing mismatches.                                                                                                |
| 6   | Email storage — encrypt at rest vs plaintext                | AES-256 encrypt email in DB / store plaintext                                                              | Plaintext                                                             | Email must be readable to send verification/reset emails. Encryption would require decrypting on every lookup, adds key-management complexity, and provides marginal benefit since the app server that reads the emails already has DB access. TLS covers transit.                                                                                         |
| 7   | Shared password policy constant — per-form vs shared util   | Duplicate regex in each form / single `password-policy.ts`                                                 | Single `password-policy.ts` on both frontend and backend              | Drift between frontend and backend policy creates UX bugs where the meter shows "Strong" but the server rejects the password. A single source of truth on each tier (backend util + frontend util with identical regex) prevents this.                                                                                                                     |

---

## 5. Open Questions

1. **HaveIBeenPwned integration**: NIST 800-63B recommends checking new passwords against known breach databases. The `/register` and `/reset-password` endpoints could call the HaveIBeenPwned k-Anonymity API before accepting a password. This adds ~50–200ms per auth call (network latency to HIBP). Worth doing, but not in this phase — listed here for future consideration.

2. **Password change endpoint**: There is currently no `POST /auth/change-password` endpoint (the `change-email` endpoint exists but is disabled in the controller). Once added, it will need the same policy enforcement and strength meter treatment defined in this spec.

3. **Maximum login attempt lockout**: Rate limiting exists (`Throttle` at 10/min for login, 5/min for register). Consider whether after N failed attempts the account should be locked and an unlock email sent — this is a separate security spec.

---

> Run `pnpm generate:types` after Phase 1 to regenerate shared-types from the updated `auth.yaml`.
