DO $$
BEGIN
  CREATE TYPE auth_token_purpose AS ENUM (
    'verify_email',
    'reset_password'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE email_outbox_status AS ENUM (
    'pending',
    'processing',
    'sent',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp;

-- Existing active accounts were admitted before e-mail verification existed.
-- Preserve their access; the requirement applies to new registrations.
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS auth_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose auth_token_purpose NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_tokens_token_hash ON auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens (expires_at);

CREATE TABLE IF NOT EXISTS email_outbox (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_token_id text NOT NULL REFERENCES auth_tokens(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  template text NOT NULL,
  payload_encrypted text NOT NULL,
  status email_outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error text,
  sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_user ON email_outbox (user_id);

-- Tokens from the former implementation were stored in plaintext and may
-- also have appeared in application logs. They must never remain usable.
UPDATE users
SET reset_token = NULL, reset_token_expires_at = NULL
WHERE reset_token IS NOT NULL OR reset_token_expires_at IS NOT NULL;
