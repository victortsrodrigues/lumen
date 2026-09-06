-- Never repair or remove ambiguous links automatically. Stop for review instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT member_id FROM users WHERE member_id IS NOT NULL
    GROUP BY member_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate account/member links: review users.member_id before migrating';
  END IF;
  IF EXISTS (
    SELECT 1 FROM users u LEFT JOIN members m ON m.id = u.member_id
    WHERE u.member_id IS NOT NULL AND m.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan account/member links: review users.member_id before migrating';
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS member_link_reviewed_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_member_id_unique ON users(member_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'users_member_id_members_id_fk' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_member_id_members_id_fk
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;
