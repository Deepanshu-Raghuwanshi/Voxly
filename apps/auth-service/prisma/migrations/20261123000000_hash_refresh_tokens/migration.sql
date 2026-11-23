BEGIN;

-- Preserve existing sessions by hashing their current cookie value in place.
UPDATE "chat_auth"."RefreshToken"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

ALTER TABLE "chat_auth"."RefreshToken" RENAME COLUMN "token" TO "tokenHash";
ALTER INDEX "chat_auth"."RefreshToken_token_key" RENAME TO "RefreshToken_tokenHash_key";

COMMIT;
