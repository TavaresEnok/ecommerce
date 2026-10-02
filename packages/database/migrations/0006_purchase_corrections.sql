-- Operational address correction keeps the address originally informed in shop.orders.
CREATE TABLE shop.order_address_corrections (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, address jsonb NOT NULL, reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
ALTER TABLE shop.order_address_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.order_address_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON shop.order_address_corrections USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant());
CREATE INDEX order_address_corrections_order ON shop.order_address_corrections(tenant_id,order_id);
CREATE INDEX payment_attempts_due ON shop.payment_attempts(tenant_id,next_check_at);
CREATE INDEX purchase_outbox_pending ON shop.purchase_outbox(tenant_id,next_run_at) WHERE executed_at IS NULL;
CREATE INDEX payment_inbox_pending ON shop.payment_inbox(tenant_id,received_at) WHERE processed_at IS NULL;
CREATE INDEX order_incidents_open ON shop.order_incidents(tenant_id,order_id) WHERE status='OPEN';
GRANT SELECT,INSERT ON shop.order_address_corrections TO app_user;
GRANT SELECT ON shop.order_address_corrections TO backup_user;
