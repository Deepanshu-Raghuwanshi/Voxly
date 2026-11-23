# Global Authentication Architecture
## Production-Hardened Edition — March 2026

---

## 1. Core Principles & Identity Strategy

- **Universal User ID**: Every user is uniquely identified by a UUID generated exclusively by the `auth-service`.
- **Identity Consistency**: This Universal ID is propagated via Kafka events and must be stored consistently across all downstream services (`user-service`, `chat-service`, `message-service`) in their `userId` field to maintain a single identity across boundaries.
- **Authority**: `auth-service` is the ONLY service permitted to generate user UUIDs. No service may create its own user identity.

---

## 2. Component Roles

### 2.1 auth-service
- Source of truth for identity.
- Generates Universal User ID.
- Manages credentials (passwords, Google ID).
- Handles login, register, token rotation, and email verification.
- Emits `user.created.v1` event via Kafka.

### 2.2 user-service
- Manages user profiles (username, full name, avatar, bio).
- Consumes `user.created.v1` to create default profiles.
- Handles profile updates.

### 2.3 frontend
- Single Page Application (Next.js).
- Uses HttpOnly cookies for JWT storage.
- Implements silent refresh and route protection.

---

## 3. Communication

- **Frontend <-> API Gateway**: REST API (cookies included).
- **auth-service -> Kafka**: `USER_CREATED` events.
- **Kafka -> user-service**: `USER_CREATED` events.
- **Internal Service Communication**: Shared types generated from OpenAPI.

---

## 4. Security Highlights
- **JWT Storage**: HttpOnly cookies to mitigate XSS.
- **Refresh Tokens**: Rotating opaque tokens to mitigate session hijacking.
- **Email Verification**: Required for local registration to mitigate spam.
- **Rate Limiting**: Throttler on all auth endpoints to mitigate brute-force.
- **Universal ID**: Consistent identification across microservices.

## 5. Session Lifetime

- The access JWT expires after 15 minutes. The browser silently refreshes it once when a protected API request returns `401`.
- A successful refresh rotates the cookie and extends its expiry by up to seven days. The server caps the JWT and refresh cookie at 30 days after the session row was created. Older sessions use the creation time of their last pre-migration rotation.
- PostgreSQL stores the refresh token's SHA-256 hash. Rotation updates the existing row only if the presented hash is still current. Logout removes that hash and clears both cookies.
- The frontend checks the session with the authenticated profile API before displaying protected pages. A temporary verification failure offers a retry. A rejected session redirects a protected link to sign-in.
- Presence sockets disconnect at the access JWT deadline. The frontend validates the session before reconnecting and reloads the active conversation history to catch messages missed during reconnect.
