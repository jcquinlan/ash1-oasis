-- Create app schema (kept for potential future use)
CREATE SCHEMA IF NOT EXISTS app;

-- Drop dead metrics tables — these were never written to or read from.
-- Using DROP IF EXISTS so this is safe on both fresh and existing databases.
DROP TABLE IF EXISTS app.container_metrics;
DROP TABLE IF EXISTS app.system_metrics;
