DO $$
BEGIN
  CREATE TYPE account_status AS ENUM (
    'pending',
    'active',
    'blocked',
    'revoked',
    'deleting'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS status account_status NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_changed_by_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_at timestamp NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

UPDATE users
SET
  requested_at = created_at,
  approved_at = COALESCE(approved_at, created_at)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_member_id ON users (member_id);
