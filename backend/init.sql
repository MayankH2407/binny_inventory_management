-- =============================================================================
-- Binny Inventory - Database Initialization
-- Runs automatically on first Docker startup via docker-entrypoint-initdb.d
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
