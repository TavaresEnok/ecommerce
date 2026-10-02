CREATE TABLE shop.payment_accounts (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), provider text NOT NULL CHECK(provider IN ('SIMULATED','MERCADO_PAGO')),
 environment text NOT NULL CHECK(environment IN ('SIMULATED','SANDBOX','PRODUCTION')), seller_id text NOT NULL, status text NOT NULL CHECK(status IN ('CONNECTED','REVOKED')),
 credentials_cipher text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,provider,environment)
);
CREATE TABLE shop.order_counters (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), value bigint NOT NULL CHECK(value>0), UNIQUE(tenant_id,id)
);
CREATE TABLE shop.orders (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), cart_id uuid NOT NULL, cart_version bigint NOT NULL, number bigint NOT NULL,
 order_status text NOT NULL DEFAULT 'OPEN' CHECK(order_status IN ('OPEN','COMPLETED','CANCELLED')),
 payment_status text NOT NULL DEFAULT 'PENDING' CHECK(payment_status IN ('UNPAID','PENDING','PAID','PARTIALLY_REFUNDED','REFUNDED','CHARGED_BACK')),
 fulfillment_status text NOT NULL DEFAULT 'UNFULFILLED' CHECK(fulfillment_status IN ('UNFULFILLED','PROCESSING','SHIPPED','DELIVERED','RETURNED')),
 dispute_status text NOT NULL DEFAULT 'NONE' CHECK(dispute_status IN ('NONE','OPEN','WON','LOST')),
 currency text NOT NULL CHECK(currency='BRL'), subtotal_cents bigint NOT NULL CHECK(subtotal_cents>=0), shipping_cents bigint NOT NULL CHECK(shipping_cents>=0), total_cents bigint NOT NULL CHECK(total_cents>0 AND total_cents=subtotal_cents+shipping_cents),
 buyer jsonb NOT NULL, address jsonb NOT NULL, supplier jsonb NOT NULL, shipping jsonb NOT NULL, principal_id uuid,
 cancel_requested_at timestamptz, reserved_at timestamptz NOT NULL DEFAULT now(), reservation_expires_at timestamptz NOT NULL DEFAULT now()+interval '40 minutes',
 version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,number), UNIQUE(tenant_id,cart_id,cart_version), FOREIGN KEY(tenant_id,cart_id) REFERENCES shop.carts(tenant_id,id)
);
CREATE TABLE shop.order_items (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, variant_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), price_cents bigint NOT NULL CHECK(price_cents>=0), snapshot jsonb NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,order_id,variant_id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,variant_id) REFERENCES shop.product_variants(tenant_id,id)
);
CREATE TABLE shop.checkout_requests (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), cart_id uuid NOT NULL, operation_key text NOT NULL, fingerprint text NOT NULL, order_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,cart_id,operation_key), FOREIGN KEY(tenant_id,cart_id) REFERENCES shop.carts(tenant_id,id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id)
);
CREATE TABLE shop.inventory_reservations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, item_id uuid NOT NULL, quantity integer NOT NULL CHECK(quantity>0),
 status text NOT NULL CHECK(status IN ('ACTIVE','CONSUMED','RELEASED')), generation integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,order_id,item_id,generation), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,item_id) REFERENCES shop.inventory_items(tenant_id,id), CHECK((status='ACTIVE')=(ended_at IS NULL))
);
ALTER TABLE shop.inventory_movements ALTER COLUMN actor_membership_id DROP NOT NULL;
ALTER TABLE shop.inventory_movements ADD COLUMN actor_kind text NOT NULL DEFAULT 'MEMBERSHIP' CHECK(actor_kind IN ('MEMBERSHIP','SYSTEM'));
ALTER TABLE shop.inventory_movements ADD COLUMN reserved_delta integer NOT NULL DEFAULT 0;
ALTER TABLE shop.inventory_movements ADD COLUMN reservation_id uuid;
ALTER TABLE shop.inventory_movements ADD COLUMN operation_key text;
ALTER TABLE shop.inventory_movements ADD CONSTRAINT movement_actor CHECK((actor_kind='MEMBERSHIP' AND actor_membership_id IS NOT NULL) OR (actor_kind='SYSTEM' AND actor_membership_id IS NULL AND operation_key IS NOT NULL));
ALTER TABLE shop.inventory_movements ADD CONSTRAINT movement_reservation_fk FOREIGN KEY(tenant_id,reservation_id) REFERENCES shop.inventory_reservations(tenant_id,id);
ALTER TABLE shop.inventory_movements ADD CONSTRAINT movement_operation UNIQUE(tenant_id,operation_key);
CREATE TABLE shop.payment_attempts (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, account_id uuid NOT NULL, method text NOT NULL CHECK(method IN ('PIX','CARD')),
 status text NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED','UNKNOWN')),
 operation_key text NOT NULL, expected_cents bigint NOT NULL CHECK(expected_cents>0), currency text NOT NULL CHECK(currency='BRL'), external_id text,
 raw_status text, last_checked_at timestamptz, next_check_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,operation_key), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,account_id) REFERENCES shop.payment_accounts(tenant_id,id)
);
CREATE TABLE shop.payment_transactions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, attempt_id uuid NOT NULL, account_id uuid NOT NULL,
 provider text NOT NULL, environment text NOT NULL, external_id text NOT NULL, received_cents bigint NOT NULL CHECK(received_cents>=0), currency text NOT NULL,
 classification text NOT NULL CHECK(classification IN ('PRINCIPAL','EXCESS','INCOMPATIBLE')), approved_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,provider,account_id,environment,external_id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,attempt_id) REFERENCES shop.payment_attempts(tenant_id,id), FOREIGN KEY(tenant_id,account_id) REFERENCES shop.payment_accounts(tenant_id,id)
);
ALTER TABLE shop.orders ADD CONSTRAINT order_principal_fk FOREIGN KEY(tenant_id,principal_id) REFERENCES shop.payment_transactions(tenant_id,id);
CREATE TABLE shop.payment_refunds (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), transaction_id uuid NOT NULL, external_id text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0), confirmed_at timestamptz NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,transaction_id,external_id), FOREIGN KEY(tenant_id,transaction_id) REFERENCES shop.payment_transactions(tenant_id,id)
);
CREATE TABLE shop.payment_disputes (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), transaction_id uuid NOT NULL, external_id text NOT NULL, status text NOT NULL CHECK(status IN ('OPEN','WON','LOST')), financial_loss boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,transaction_id,external_id), FOREIGN KEY(tenant_id,transaction_id) REFERENCES shop.payment_transactions(tenant_id,id)
);
CREATE TABLE shop.order_incidents (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, transaction_id uuid, code text NOT NULL, operation_key text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')), due_cents bigint NOT NULL DEFAULT 0 CHECK(due_cents>=0), note text, actor_membership_id uuid, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,operation_key), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,transaction_id) REFERENCES shop.payment_transactions(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE TABLE shop.order_history (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, event text NOT NULL, previous jsonb NOT NULL, current jsonb NOT NULL, actor_membership_id uuid, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE TABLE shop.purchase_outbox (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), aggregate_id uuid NOT NULL, aggregate_version bigint NOT NULL, type text NOT NULL, payload_version integer NOT NULL DEFAULT 1 CHECK(payload_version=1), occurred_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, executed_at timestamptz, failures integer NOT NULL DEFAULT 0, next_run_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,aggregate_id) REFERENCES shop.orders(tenant_id,id)
);
CREATE TABLE shop.purchase_receipts (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), event_id uuid NOT NULL, consumer text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,event_id,consumer), FOREIGN KEY(tenant_id,event_id) REFERENCES shop.purchase_outbox(tenant_id,id)
);
CREATE TABLE shop.payment_inbox (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), account_id uuid NOT NULL, event_id text NOT NULL, resource_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, quarantine_reason text,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,account_id,event_id), FOREIGN KEY(tenant_id,account_id) REFERENCES shop.payment_accounts(tenant_id,id)
);
CREATE TABLE shop.consumer_requests (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, operation_key text NOT NULL, fingerprint text NOT NULL, kind text NOT NULL CHECK(kind IN ('CANCELLATION','WITHDRAWAL','SUPPORT')), message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,order_id,operation_key), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id)
);
-- Controlled provider truth, not a business confirmation; never enabled in production.
CREATE TABLE shop.simulated_payments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), account_id uuid NOT NULL, reference uuid NOT NULL, operation_key text NOT NULL, status text NOT NULL DEFAULT 'PENDING', amount_cents bigint NOT NULL CHECK(amount_cents>=0), currency text NOT NULL DEFAULT 'BRL', seller_id text NOT NULL, environment text NOT NULL DEFAULT 'SIMULATED',
 refunds jsonb NOT NULL DEFAULT '[]', dispute jsonb, approved_at timestamptz, expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes', revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,operation_key), FOREIGN KEY(tenant_id,account_id) REFERENCES shop.payment_accounts(tenant_id,id), FOREIGN KEY(tenant_id,reference) REFERENCES shop.payment_attempts(tenant_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['payment_accounts','order_counters','orders','order_items','checkout_requests','inventory_reservations','payment_attempts','payment_transactions','payment_refunds','payment_disputes','order_incidents','order_history','purchase_outbox','purchase_receipts','payment_inbox','consumer_requests','simulated_payments'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
-- Definer access is limited to queue routing and account routing metadata.
CREATE POLICY dispatch_resolver ON shop.purchase_outbox FOR SELECT TO migration_user USING(true);
CREATE POLICY account_resolver ON shop.payment_accounts FOR SELECT TO migration_user USING(true);
CREATE FUNCTION shop.purchase_routes() RETURNS TABLE(tenant_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$ SELECT DISTINCT o.tenant_id FROM shop.purchase_outbox o $$;
CREATE FUNCTION shop.payment_route(account uuid) RETURNS TABLE(tenant_id uuid,provider text,environment text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$ SELECT a.tenant_id,a.provider,a.environment FROM shop.payment_accounts a WHERE a.id=account $$;
REVOKE ALL ON FUNCTION shop.purchase_routes(),shop.payment_route(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shop.purchase_routes(),shop.payment_route(uuid) TO app_user;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA shop TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA shop TO backup_user;
REVOKE UPDATE ON shop.theme_revisions,shop.theme_media,shop.inventory_movements,shop.storefront_events,shop.order_items,shop.checkout_requests,shop.order_history,shop.payment_transactions,shop.payment_refunds,shop.purchase_receipts,shop.consumer_requests FROM app_user;
