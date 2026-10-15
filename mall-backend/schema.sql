-- Mobile System backend schema. This same schema is created automatically by server.js at startup.
CREATE TABLE IF NOT EXISTS app_records (
  collection_key TEXT NOT NULL CHECK (
    collection_key IN ('brands', 'devices', 'sales', 'returns', 'customers', 'offers', 'warehouse-batches', 'payments', 'settings')
  ),
  record_id TEXT NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_key, record_id)
);
CREATE INDEX IF NOT EXISTS app_records_collection_updated_idx ON app_records (collection_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_records_payload_gin_idx ON app_records USING GIN (payload jsonb_path_ops);
CREATE TABLE IF NOT EXISTS app_audit_log (
  id BIGSERIAL PRIMARY KEY,
  collection_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'import')),
  client_ip INET,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_audit_log_happened_at_idx ON app_audit_log (happened_at DESC);
