-- Council minutes already use external media URLs. Keep the database enum
-- aligned with the API instead of rejecting these links at insertion time.
ALTER TYPE media_entity_type ADD VALUE IF NOT EXISTS 'council_meeting';
