-- Keep the enum change in its own committed migration before using the value.
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'rejected';
