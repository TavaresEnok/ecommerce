-- Fase 4: expedição, atendimento, notificações, suspensão, exportação e eliminação.
ALTER TABLE shop.tenants ADD COLUMN sales_paused_at timestamptz, ADD COLUMN sales_pause_reason text;
CREATE TABLE shop.tenant_lifecycle_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), action text NOT NULL CHECK(action IN ('SUSPENDED','REACTIVATED','SALES_PAUSED','SALES_RESUMED')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500), actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE shop.shipments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('CARRIER','PICKUP')),
 carrier text, tracking_code text, ready_at timestamptz, shipped_at timestamptz, delivered_at timestamptz, delivery_proof text, returned_at timestamptz, return_note text,
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,order_id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id),
 CHECK(kind='PICKUP' OR shipped_at IS NULL OR carrier IS NOT NULL)
);
ALTER TABLE shop.orders ADD COLUMN fiscal_reference text;
-- Consumer requests become support tickets; general contact has no order and is followed by a hashed secret.
ALTER TABLE shop.consumer_requests ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE shop.consumer_requests DROP CONSTRAINT consumer_requests_kind_check;
ALTER TABLE shop.consumer_requests ADD CONSTRAINT consumer_requests_kind_check CHECK(kind IN ('CANCELLATION','WITHDRAWAL','SUPPORT','DATA_ACCESS','DATA_ERASURE','CONTACT'));
ALTER TABLE shop.consumer_requests ADD COLUMN contact_name text, ADD COLUMN contact_email text, ADD COLUMN access_hash text,
 ADD COLUMN status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED')), ADD COLUMN assignee_membership_id uuid,
 ADD COLUMN due_at timestamptz, ADD COLUMN resolution text, ADD COLUMN outcome text CHECK(outcome IN ('ACCEPTED','DECLINED','WITHDRAWN_BY_CONSUMER','INFORMED')), ADD COLUMN resolved_at timestamptz,
 ADD COLUMN financial_notified_at timestamptz, ADD COLUMN financial_reference text, ADD COLUMN financial_actor_membership_id uuid,
 ADD CONSTRAINT consumer_request_target CHECK(order_id IS NOT NULL OR (access_hash IS NOT NULL AND contact_email IS NOT NULL)),
 ADD CONSTRAINT consumer_request_assignee FOREIGN KEY(tenant_id,assignee_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id),
 ADD CONSTRAINT consumer_request_financial_actor FOREIGN KEY(tenant_id,financial_actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id);
UPDATE shop.consumer_requests SET due_at=created_at+interval '5 days' WHERE due_at IS NULL;
ALTER TABLE shop.consumer_requests ALTER COLUMN due_at SET NOT NULL, ALTER COLUMN due_at SET DEFAULT now()+interval '5 days';
CREATE UNIQUE INDEX consumer_requests_contact_key ON shop.consumer_requests(tenant_id,operation_key) WHERE order_id IS NULL;
CREATE INDEX consumer_requests_open ON shop.consumer_requests(tenant_id,due_at) WHERE status<>'RESOLVED';
CREATE TABLE shop.support_messages (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), request_id uuid NOT NULL, author text NOT NULL CHECK(author IN ('CONSUMER','STAFF','SYSTEM')),
 actor_membership_id uuid, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,request_id) REFERENCES shop.consumer_requests(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
-- Durable e-mail queue written in the same transaction as the business fact; delivery is retried by the worker.
CREATE TABLE shop.notifications (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid, request_id uuid, template text NOT NULL, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
 operation_key text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','SIMULATED','FAILED','HELD')), attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, provider text, provider_message_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,operation_key), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,request_id) REFERENCES shop.consumer_requests(tenant_id,id)
);
CREATE INDEX notifications_due ON shop.notifications(tenant_id,next_attempt_at) WHERE status='PENDING';
CREATE TABLE shop.data_exports (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), kind text NOT NULL CHECK(kind IN ('STORE','CONSUMER')), order_id uuid, token_hash text NOT NULL,
 actor_membership_id uuid NOT NULL, expires_at timestamptz NOT NULL, downloaded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE TABLE shop.privacy_erasures (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, request_id uuid, actor_membership_id uuid NOT NULL, reason text NOT NULL, executed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,order_id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
-- Buyer link secret: generated when an e-mail is sent, stored only as hash, expires and can be revoked.
CREATE TABLE shop.order_access_tokens (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,token_hash), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['tenant_lifecycle_events','shipments','support_messages','notifications','data_exports','privacy_erasures','order_access_tokens'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
-- Worker discovery: every tenant with a public route or purchase activity, nothing else.
CREATE FUNCTION shop.operation_routes() RETURNS TABLE(tenant_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$ SELECT r.tenant_id FROM shop.platform_routes r UNION SELECT o.tenant_id FROM shop.purchase_outbox o $$;
REVOKE ALL ON FUNCTION shop.operation_routes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shop.operation_routes() TO app_user;
GRANT SELECT,INSERT ON shop.tenant_lifecycle_events,shop.support_messages,shop.privacy_erasures TO app_user;
GRANT SELECT,INSERT,UPDATE ON shop.shipments,shop.notifications,shop.data_exports,shop.order_access_tokens TO app_user;
GRANT UPDATE(status,assignee_membership_id,resolution,outcome,resolved_at,financial_notified_at,financial_reference,financial_actor_membership_id,message,contact_name,contact_email) ON shop.consumer_requests TO app_user;
GRANT UPDATE(address) ON shop.order_address_corrections TO app_user;
GRANT UPDATE(body) ON shop.support_messages TO app_user;
GRANT SELECT ON shop.tenant_lifecycle_events,shop.shipments,shop.support_messages,shop.notifications,shop.data_exports,shop.privacy_erasures,shop.order_access_tokens TO backup_user;
