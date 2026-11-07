CREATE TABLE offers (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  response_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  responded_at TEXT,
  UNIQUE(owner_id, offer_id)
);
--> statement-breakpoint
CREATE INDEX offers_owner_created_idx ON offers(owner_id, created_at);
