-- Mobile System normalized PostgreSQL schema.
-- Additive only: does not drop or alter the generic app_records tables from the earlier prototype.

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT)
);

CREATE TABLE IF NOT EXISTS brand_series (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT),
  UNIQUE (brand_id, name_key)
);

CREATE TABLE IF NOT EXISTS brand_models (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE CASCADE,
  series_id TEXT NOT NULL REFERENCES brand_series(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT),
  UNIQUE (series_id, name_key)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_key TEXT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT)
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_key_unique
  ON customers(phone_key) WHERE phone_key IS NOT NULL AND phone_key <> '';

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(14,2) NOT NULL CHECK (discount_value >= 0),
  duration_days INTEGER NOT NULL DEFAULT 0 CHECK (duration_days >= 0),
  expires_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT)
);
CREATE INDEX IF NOT EXISTS offers_expires_at_idx ON offers(expires_at);

CREATE TABLE IF NOT EXISTS warehouse_batches (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  series_id TEXT NOT NULL REFERENCES brand_series(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  model_id TEXT NOT NULL REFERENCES brand_models(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  received_quantity INTEGER NOT NULL CHECK (received_quantity > 0),
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0 AND available_quantity <= received_quantity),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  supplier_name TEXT NOT NULL DEFAULT '',
  received_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT)
);
CREATE INDEX IF NOT EXISTS warehouse_batches_catalog_idx ON warehouse_batches(brand_id, series_id, model_id);
CREATE INDEX IF NOT EXISTS warehouse_batches_received_idx ON warehouse_batches(received_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  imei TEXT NOT NULL UNIQUE,
  imei_key TEXT NOT NULL UNIQUE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  series_id TEXT NOT NULL REFERENCES brand_series(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  model_id TEXT NOT NULL REFERENCES brand_models(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  color TEXT NOT NULL DEFAULT '',
  ram TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT '',
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  installment_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (installment_price >= 0),
  offer_id TEXT REFERENCES offers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'reserved')),
  created_at BIGINT NOT NULL,
  warehouse_batch_id TEXT REFERENCES warehouse_batches(id) ON UPDATE CASCADE ON DELETE CASCADE,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);
CREATE INDEX IF NOT EXISTS devices_catalog_idx ON devices(brand_id,series_id,model_id);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT)
);



CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'credit', 'installment')),
  total NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  remaining_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  return_balance_reduced NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (return_balance_reduced >= 0),
  original_installment_amount NUMERIC(14,2),
  installments_count INTEGER NOT NULL DEFAULT 0 CHECK (installments_count >= 0),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('paid', 'partial', 'unpaid')),
  created_at_db BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT),
  CHECK (amount_paid <= total + 0.01)
);
CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS sales_customer_phone_idx ON sales(customer_phone);
CREATE INDEX IF NOT EXISTS sales_status_idx ON sales(status);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number >= 0),
  brand TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT 'عام',
  model TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  ram TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT '',
  original_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (original_price >= 0),
  cash_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cash_price >= 0),
  installment_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (installment_price >= 0),
  cash_final_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cash_final_price >= 0),
  installment_final_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (installment_final_price >= 0),
  final_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (final_price >= 0),
  offer_name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  warehouse_batch_id TEXT REFERENCES warehouse_batches(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  is_new_stock BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (sale_id, line_number)
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id, line_number);
CREATE INDEX IF NOT EXISTS sale_items_batch_idx ON sale_items(warehouse_batch_id);

CREATE TABLE IF NOT EXISTS sale_installments (
  sale_id TEXT NOT NULL REFERENCES sales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  PRIMARY KEY (sale_id, installment_number)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  installment_number INTEGER,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  record_type TEXT NOT NULL CHECK (record_type IN ('initial_payment', 'installment_payment', 'debt_payment')),
  created_at BIGINT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS payments_sale_idx ON payments(sale_id, created_at DESC);

CREATE TABLE IF NOT EXISTS returns (
  return_id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  item_index INTEGER NOT NULL CHECK (item_index >= 0),
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  device_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  total_refund_amount NUMERIC(14,2) NOT NULL CHECK (total_refund_amount >= 0),
  usage_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (usage_fee >= 0),
  net_return_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_return_amount >= 0),
  balance_reduced NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_reduced >= 0),
  customer_refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (customer_refund_amount >= 0),
  settlement_status TEXT NOT NULL DEFAULT 'completed' CHECK (settlement_status IN ('pending', 'completed')),
  reason TEXT NOT NULL CHECK (reason IN ('defect', 'change_mind', 'unsuitable', 'other')),
  device_condition TEXT NOT NULL CHECK (device_condition IN ('sound', 'damaged', 'inspection_needed')),
  settlement_method TEXT NOT NULL CHECK (settlement_method IN ('cash_refund', 'store_credit', 'remaining_settlement', 'exchange')),
  status TEXT NOT NULL DEFAULT 'completed',
  linked_new_invoice_number TEXT
);
CREATE INDEX IF NOT EXISTS returns_sale_idx ON returns(sale_id, item_index);
CREATE INDEX IF NOT EXISTS returns_created_at_idx ON returns(created_at DESC);

-- Import/idempotency ledger used when moving localStorage data into this database.
CREATE TABLE IF NOT EXISTS import_batches (
  import_key TEXT PRIMARY KEY,
  imported_at BIGINT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);


-- Employee identity and organization hierarchy for Mobile System.
-- PINs are stored as scrypt digests with a per-employee salt; clear PINs are never stored.
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('worker', 'manager', 'owner', 'developer')),
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  manager_id TEXT REFERENCES employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT)
);

-- Additive compatibility migration for databases that already have a legacy employees table.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS name_key TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_salt TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id TEXT REFERENCES employees(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT ((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT);
CREATE INDEX IF NOT EXISTS employees_role_active_idx ON employees(role, is_active);
CREATE INDEX IF NOT EXISTS employees_manager_idx ON employees(manager_id);
CREATE INDEX IF NOT EXISTS employees_name_key_idx ON employees(name_key);
