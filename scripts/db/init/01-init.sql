-- Create app schema for metrics storage
CREATE SCHEMA IF NOT EXISTS app;

-- Container metrics table
CREATE TABLE IF NOT EXISTS app.container_metrics (
    id SERIAL PRIMARY KEY,
    container_id VARCHAR(64) NOT NULL,
    container_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    cpu_percent DECIMAL(5,2),
    memory_usage_bytes BIGINT,
    memory_limit_bytes BIGINT,
    network_rx_bytes BIGINT,
    network_tx_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System metrics table
CREATE TABLE IF NOT EXISTS app.system_metrics (
    id SERIAL PRIMARY KEY,
    uptime_seconds BIGINT NOT NULL,
    load_avg_1m DECIMAL(5,2),
    load_avg_5m DECIMAL(5,2),
    load_avg_15m DECIMAL(5,2),
    memory_total_bytes BIGINT,
    memory_used_bytes BIGINT,
    memory_free_bytes BIGINT,
    disk_total_bytes BIGINT,
    disk_used_bytes BIGINT,
    disk_free_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for time-based queries
CREATE INDEX IF NOT EXISTS idx_container_metrics_created_at
    ON app.container_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_container_metrics_container_id
    ON app.container_metrics(container_id);
CREATE INDEX IF NOT EXISTS idx_system_metrics_created_at
    ON app.system_metrics(created_at);
