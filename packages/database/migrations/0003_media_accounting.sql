CREATE TABLE shop.media_usage (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), stored_bytes bigint NOT NULL DEFAULT 0 CHECK(stored_bytes>=0),
 reconciled_at timestamptz, UNIQUE(tenant_id,id)
);
ALTER TABLE shop.media_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.media_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON shop.media_usage USING(tenant_id=shop.current_tenant()) WITH CHECK(tenant_id=shop.current_tenant());
GRANT SELECT,INSERT,UPDATE ON shop.media_usage TO app_user;
GRANT SELECT ON shop.media_usage TO backup_user;
