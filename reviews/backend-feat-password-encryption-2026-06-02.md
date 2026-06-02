# Backend Spec Review: feat-password-encryption — 2026-06-02

> Scope: **Phase 1 (Contracts & Schema) and Phase 2 (Backend Implementation)** of
> `docs/specs/auth-security-hardening.spec.md`, against the staged changes + last commit.
> Phase 3 (frontend) is explicitly out of scope and is not implemented on this branch.

## Summary

### What Is Implemented

- **Secure token generation (Phase 2):** All four token generators now use `randomBytes(32).toString("hex")` — `generateEmailVerificationToken`, `generateRefreshToken`, `generatePasswordResetToken`, and `changeEmail`. `Math.random()` is fully removed from `auth-service/src` (verified by grep — zero matches).
- **Password policy utility (Phase 2):** `apps/auth-service/src/application/utils/password-policy.ts` created exactly as specified — plain `validatePasswordPolicy(password): void`, single source-of-truth regex, throws `BadRequestException` with the exact spec message.
- **Policy enforcement wired into use cases (Phase 2):** `validatePasswordPolicy` is called before `bcrypt.hash` in `register` (LOCAL path), `setPassword`, and `resetPassword`. **Bonus beyond spec:** it is also called on the Google-account-link path inside `register` (line 39) — a genuine gap the spec didn't list, correctly closed.
- **OpenAPI contract (Phase 1):** `auth.yaml` adds `PasswordField` (`minLength: 8`, `maxLength: 128`, complexity `pattern`), `format: email` on email fields, `ErrorResponse` schema, `securitySchemes.cookieAuth`; `RegisterDto`/`ResetPasswordDto`/`SetPasswordDto` reference `PasswordField` via `$ref`; `LoginDto.password` intentionally left as a plain string. Matches the spec's Phase 1 table.
- **Tests (Phase 2):** All spec-listed unit cases implemented plus extras (token uniqueness, Google-link weak-password, token-not-found paths). Backend regex (`password-policy.ts`) and contract regex (`auth.yaml`) are identical and consistent with the spec.
- **No schema / Kafka / module changes** — correctly omitted per spec (token column already accepts any string; policy util is a plain function, not injectable).

### What Is Pending / Incomplete

- **`pnpm generate:types` has now been run** (✅ fixed). The regenerated `libs/shared-types/src/v1/auth.types.ts` now contains `RegisterResponse`, `ErrorResponse`, `AuthUserResponse`, and `PasswordField` — contract↔types drift on the new schemas is resolved.
- **NEW BLOCKER surfaced by the regeneration:** the old generated types carried a stale `AuthResponse` schema that the current `auth.yaml` no longer defines (it defines `AuthUserResponse`). Regenerating removed `AuthResponse`, so `shared-types/src/index.ts:12`, `auth.use-cases.ts` (`login()` return type), and the integration test no longer compile. `pnpm nx typecheck auth-service` now **fails**. See Blockers.

---

## Automated Checks

| Check                            | Result    | Notes                                                                                                                  |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx typecheck auth-service` | ✅ Pass   | Was failing after types regen (`AuthResponse`); **fixed** — see Blockers                                                |
| `pnpm nx lint auth-service`      | ✅ Pass   | All files pass linting                                                                                                  |
| `pnpm nx format:check`           | ⚠️ Partial | Files I touched are clean. Remaining flags: regenerated `auth.types.ts`/`chat.types.ts` (raw `openapi-typescript` output — HEAD versions also fail prettier; pre-existing) + this review `.md`. |
| `pnpm nx test auth-service`      | ✅ Pass   | 31 passing, including all new token/policy specs                                                                       |

---

## Files Changed

| File                                                              | Type     | Description                                                                          |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `apps/auth-service/src/application/utils/password-policy.ts`      | Added    | `validatePasswordPolicy` — regex check → `BadRequestException`                       |
| `apps/auth-service/src/application/use-cases/auth.use-cases.ts`   | Modified | `randomBytes` for all 4 tokens; policy calls in register/setPassword/resetPassword   |
| `apps/auth-service/tests/unit/auth.use-cases.spec.ts`            | Modified | New `token generation`, `register` policy, `resetPassword`, `setPassword` suites     |
| `libs/openapi-specs/src/v1/auth.yaml`                            | Modified | `PasswordField`, `ErrorResponse`, `cookieAuth`, `format: email`, response codes      |
| `docs/specs/auth-security-hardening.spec.md`                     | Modified | Markdown/table reformatting only (no semantic change)                                |

---

## Blockers — Must Fix

> Breaks functionality, violates security, missing tests, violates architecture, or introduces a breaking change.

- **[SPEC] `pnpm generate:types` not run — ✅ FIXED (2026-06-02).** It has now been run; the regenerated `auth.types.ts` contains `RegisterResponse`, `ErrorResponse`, `AuthUserResponse`, and `PasswordField`. Contract↔types drift on the new schemas is resolved.

- **[BUILD] `AuthResponse` typecheck failure — ✅ FIXED (2026-06-02).** After regenerating types, `shared-types` exported `AuthResponse` from a schema `auth.yaml` no longer defines, breaking `typecheck`. Resolved via **option 2** (the architecturally cleaner one): `AuthResponse` is now defined as an exported `interface` in `apps/auth-service/src/application/use-cases/auth.use-cases.ts` (it is an internal login-result shape — tokens go out as HttpOnly cookies, not in the body, so it was never a real OpenAPI response). The stale `export type AuthResponse = …` was removed from `libs/shared-types/src/index.ts`, and `tests/integration/auth.controller.spec.ts` now imports `AuthResponse` from the use-case. `typecheck`, `lint`, and `test` all pass; no other consumer imported `AuthResponse` from `@shared-types` (verified by grep).

---

## Nitpicks — Should Fix

> Non-blocking: style, minor conventions, small improvements.

- **`libs/openapi-specs/src/v1/auth.yaml` — ✅ FIXED.** The stale comment above `PasswordField` now reads `[@$!%*?&-_#^()]`, matching the actual `pattern` and `description`.
- **`apps/auth-service/src/interfaces/controllers/auth.controller.ts` — ✅ FIXED.** Removed the debug `console.error("PRISMA ERROR:", JSON.stringify(error, null, 2))` and the redundant try/catch wrapper in the `register` handler (it only logged and re-threw). Eliminates the potential info-leak and aligns with the spec's "email never logged" policy. The controller was reformatted to prettier style while touched.
- **`auth.controller.ts` — `set-password` / `reset-password` — ✅ FIXED.** Both token-submission endpoints now carry `@Throttle({ default: { limit: 5, ttl: 60000 } })` (matching `register`), adding per-route brute-force protection on top of the global `ThrottlerGuard`.

---

## Detailed Dimension Notes

- **Completeness vs OpenAPI:** All three policy-bearing endpoints enforce the policy; `400` is now documented and actually thrown; `409` on register preserved. No `TODO`/`FIXME`/placeholder left. No new route prefix, so no gateway change needed.
- **Pattern & structure:** Util placed in `application/utils/` (new but reasonable folder for a stateless helper); use case keeps single public surface and named NestJS exceptions; controller stays thin and was correctly left untouched (validation belongs in the use case per Decision #4). Test file follows existing chai/sinon `describe/it` structure with specific descriptions.
- **DDD layers:** `password-policy.ts` imports `BadRequestException` from `@nestjs/common`. This is the **application** layer, which already imports NestJS exceptions in `auth.use-cases.ts` — not a domain-layer violation. No boundary crossed.
- **No duplication:** Single regex constant per tier; no copy-paste between use cases (each generator is its own concern).
- **Security:** No sensitive fields returned (`register` → `{id, email}`); refresh tokens rotated and deleted; `setPassword`/`resetPassword` wrapped in `$transaction` (atomic). The `register` catch block was improved to no longer interpolate `user.email` into the log. 256-bit CSPRNG tokens replace predictable `Math.random()`.
- **Error handling & resilience:** Token-then-policy ordering in reset/set matches the spec's prescribed data flow. Transactions guarantee no partial password update on failure. Email-send failures are caught and logged without aborting registration (pre-existing, intentional).
- **TypeScript quality:** No `any`, no `as` abuse, no `@ts-ignore`; `validatePasswordPolicy` has an explicit `void` return type.
- **Tests:** 31 passing. Negative cases cover under-length, missing-upper, missing-lower, missing-digit, missing-special, over-128, and "bcrypt not called on failure". `does not call bcrypt.hash` correctly stubs and asserts `called === false`. Each `it` is independent (`sinon.restore()` in `afterEach`).

---

## Verdict

**Ready to merge** (one optional tooling follow-up).

Phase 2 (backend) is implemented essentially perfectly: CSPRNG tokens everywhere, policy enforced before hashing on every password-setting path (including a Google-link path the spec missed), strong and complete test coverage. Phase 1's `pnpm generate:types` has been run, and the build-breaking `AuthResponse` inconsistency it exposed has been fixed by localizing the type in auth-service. **`typecheck`, `lint`, and `test` (31 passing) are all green.**

The only remaining `format:check` flags are the regenerated `auth.types.ts`/`chat.types.ts` — raw `openapi-typescript` output that the HEAD versions also fail (the `generate:types` script has no prettier step). This is pre-existing repo convention, not a regression from this work. **Optional follow-up:** add a `prettier --write` step to `tools/scripts/generate-types.js` so regenerated types are committed prettier-clean and stop tripping `format:check` on any future type-regen branch. Confidence in the password-hardening logic is high.
