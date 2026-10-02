-- Fase 5: observação do piloto sem dados pessoais (códigos e contagens, nunca carrinho, comprador ou mensagem).
CREATE TABLE shop.checkout_failures (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), reason text NOT NULL CHECK(reason IN ('PRICE_OR_SHIPPING_CHANGED','STOCK_UNAVAILABLE','SALES_CLOSED','PAYMENT_ACCOUNT','IDEMPOTENCY_CONFLICT','INVALID_INPUT','SERVICE_UNAVAILABLE','OTHER')),
 status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE INDEX checkout_failures_period ON shop.checkout_failures(tenant_id,created_at);
-- Operator-recorded support effort (minutes); the note must not contain personal data.
CREATE TABLE shop.support_time_entries (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 category text NOT NULL CHECK(category IN ('ONBOARDING','CATALOGUE','PAYMENT','SHIPPING','REFUND','CONSUMER','BUG','OTHER')), note text NOT NULL CHECK(length(note) BETWEEN 1 AND 300),
 actor text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['checkout_failures','support_time_entries'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON shop.checkout_failures,shop.support_time_entries TO app_user;
GRANT SELECT ON shop.checkout_failures,shop.support_time_entries TO backup_user;
