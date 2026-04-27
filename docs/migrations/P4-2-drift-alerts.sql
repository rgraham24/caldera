-- P4-2 — drift_alerts table for Phase 4 reconciliation
-- Append-only audit log of all reconciliation actions and detected drift.
-- Run via Supabase SQL editor.

CREATE TABLE drift_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  table_name TEXT,
  row_id UUID,
  before_status TEXT,
  after_status TEXT,
  tx_hash TEXT,
  ledger_sum_nanos BIGINT,
  onchain_sum_nanos BIGINT,
  diff_nanos BIGINT,
  detail JSONB,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  CONSTRAINT drift_alerts_alert_type_check CHECK (alert_type IN ('reconciliation_action', 'drift_detected', 'verifyTx_persistent_failure')),
  CONSTRAINT drift_alerts_severity_check CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
  CONSTRAINT drift_alerts_triggered_by_check CHECK (triggered_by IN ('cron', 'admin', 'manual'))
);

CREATE INDEX idx_drift_alerts_created_at ON drift_alerts(created_at DESC);

CREATE INDEX idx_drift_alerts_severity_recent ON drift_alerts(severity, created_at DESC) WHERE severity IN ('WARN', 'CRITICAL');

CREATE INDEX idx_drift_alerts_row_id ON drift_alerts(row_id) WHERE row_id IS NOT NULL;

COMMENT ON TABLE drift_alerts IS 'P4 reconciliation audit trail. Append-only. Records every action and detected drift.';
