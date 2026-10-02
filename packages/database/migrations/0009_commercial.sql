-- Fase 6: MFA, administração da plataforma, planos/assinatura/faturas, cotas, reembolso iniciado, domínio próprio e frete por provedor.
-- ---- MFA (TOTP RFC 6238) e administração da plataforma: identidade global, papel auth_user.
CREATE TABLE access.mfa_factors (
 user_id uuid PRIMARY KEY REFERENCES access.users(id), secret_cipher text NOT NULL, enabled_at timestamptz, last_used_step bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE access.mfa_recovery_codes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES access.users(id), code_hash text NOT NULL UNIQUE, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE access.sessions ADD COLUMN mfa_at timestamptz;
CREATE TABLE access.platform_admins (
 user_id uuid PRIMARY KEY REFERENCES access.users(id), granted_by text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE access.platform_audit (
 id uuid PRIMARY KEY, admin_user_id uuid NOT NULL REFERENCES access.users(id), action text NOT NULL, tenant_id uuid, reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500), detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON access.mfa_factors,access.mfa_recovery_codes TO auth_user;
GRANT SELECT ON access.platform_admins TO auth_user;
GRANT SELECT,INSERT ON access.platform_audit TO auth_user;
GRANT UPDATE(mfa_at) ON access.sessions TO auth_user;
GRANT SELECT ON access.mfa_factors,access.mfa_recovery_codes,access.platform_admins,access.platform_audit TO backup_user;
-- ---- Catálogo global de planos (não é dado de loja). Versões são imutáveis; só o estado muda.
CREATE SCHEMA platform;
CREATE TABLE platform.plan_versions (
 id uuid PRIMARY KEY, code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_]{1,30}$'), version integer NOT NULL CHECK(version>0), name text NOT NULL,
 price_cents bigint CHECK(price_cents IS NULL OR price_cents>=0), currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'), billing_interval text NOT NULL CHECK(billing_interval IN ('NONE','MONTH')),
 entitlements jsonb NOT NULL, commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps=0), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','RETIRED')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz, retired_at timestamptz, UNIQUE(code,version),
 -- A paid plan cannot be offered without an approved price (D07); PILOT is internal and free.
 CHECK(status<>'ACTIVE' OR code='PILOT' OR (price_cents IS NOT NULL AND price_cents>0 AND billing_interval='MONTH')),
 CHECK(jsonb_typeof(entitlements->'active_products')='number' AND jsonb_typeof(entitlements->'active_variants')='number' AND jsonb_typeof(entitlements->'media_bytes')='number' AND jsonb_typeof(entitlements->'members')='number' AND entitlements->>'media_mode' IN ('TOLERANCE','STRICT'))
);
INSERT INTO platform.plan_versions(id,code,version,name,price_cents,billing_interval,entitlements,status,created_by,activated_at)
 VALUES('01920000-0000-7000-8000-000000000001','PILOT',1,'Piloto (interno, sem mensalidade)',0,'NONE','{"active_products":100,"active_variants":500,"media_bytes":1073741824,"members":2,"media_mode":"TOLERANCE"}','ACTIVE','migration',now());
GRANT USAGE ON SCHEMA platform TO app_user,backup_user;
GRANT SELECT,INSERT ON platform.plan_versions TO app_user;
GRANT UPDATE(status,activated_at,retired_at) ON platform.plan_versions TO app_user;
GRANT SELECT ON platform.plan_versions TO backup_user;
-- ---- Assinatura SaaS por loja (separada das contas de pagamento do lojista).
CREATE TABLE shop.subscriptions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), plan_version_id uuid NOT NULL REFERENCES platform.plan_versions(id), pending_plan_version_id uuid REFERENCES platform.plan_versions(id),
 status text NOT NULL CHECK(status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED')), provider text NOT NULL DEFAULT 'NONE' CHECK(provider IN ('NONE','SIMULATED')),
 current_period_start timestamptz NOT NULL DEFAULT now(), current_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false, grace_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
INSERT INTO shop.subscriptions(id,tenant_id,plan_version_id,status) SELECT gen_random_uuid(),t.id,'01920000-0000-7000-8000-000000000001','ACTIVE' FROM shop.tenants t;
CREATE TABLE shop.subscription_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), subscription_id uuid NOT NULL, event text NOT NULL, previous jsonb NOT NULL, current jsonb NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,subscription_id) REFERENCES shop.subscriptions(tenant_id,id)
);
CREATE TABLE shop.saas_invoices (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), subscription_id uuid NOT NULL, plan_version_id uuid NOT NULL REFERENCES platform.plan_versions(id),
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL CHECK(period_end>period_start), amount_cents bigint NOT NULL CHECK(amount_cents>0), currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PAID','VOID','UNCOLLECTIBLE')), due_at timestamptz NOT NULL, paid_at timestamptz, provider_ref text, charge_requested_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,subscription_id,period_start), FOREIGN KEY(tenant_id,subscription_id) REFERENCES shop.subscriptions(tenant_id,id)
);
CREATE TABLE shop.saas_billing_inbox (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), provider text NOT NULL, event_id text NOT NULL, invoice_id uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(provider,event_id), FOREIGN KEY(tenant_id,invoice_id) REFERENCES shop.saas_invoices(tenant_id,id)
);
-- Controlled provider truth for the SaaS billing simulator; never enabled in production.
CREATE TABLE shop.simulated_saas_charges (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), invoice_id uuid NOT NULL, amount_cents bigint NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,invoice_id), FOREIGN KEY(tenant_id,invoice_id) REFERENCES shop.saas_invoices(tenant_id,id)
);
-- ---- Cota rigorosa de mídia: reservas atômicas com expiração.
ALTER TABLE shop.media_usage ADD COLUMN reserved_bytes bigint NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0);
CREATE TABLE shop.media_reservations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), asset_id uuid NOT NULL, bytes bigint NOT NULL CHECK(bytes>0), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMMITTED','RELEASED')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,asset_id), FOREIGN KEY(tenant_id,asset_id) REFERENCES shop.media_assets(tenant_id,id)
);
-- ---- Reembolso iniciado pela plataforma: intenção persistida antes da chamada externa.
CREATE TABLE shop.refund_requests (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), order_id uuid NOT NULL, transaction_id uuid NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
 operation_key text NOT NULL, fingerprint text NOT NULL, status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','UNKNOWN','PENDING','CONFIRMED','FAILED')),
 provider_refund_id text, failure_reason text, reason text NOT NULL, actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,operation_key), FOREIGN KEY(tenant_id,order_id) REFERENCES shop.orders(tenant_id,id), FOREIGN KEY(tenant_id,transaction_id) REFERENCES shop.payment_transactions(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
ALTER TABLE shop.simulated_payments ADD COLUMN refund_mode text NOT NULL DEFAULT 'OK' CHECK(refund_mode IN ('OK','INSUFFICIENT_BALANCE','TIMEOUT_AFTER_ACCEPT'));
-- ---- Domínio próprio (seção 17.2). Unicidade global só para domínios verificados; reivindicações pendentes não bloqueiam o dono real.
CREATE TABLE shop.custom_domains (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), hostname text NOT NULL CHECK(hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' AND length(hostname)<=253),
 status text NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK(status IN ('PENDING_VERIFICATION','PENDING_TLS','ACTIVE','FAILED','DISABLED')), challenge_token text NOT NULL, canonical boolean NOT NULL DEFAULT false,
 provider text NOT NULL DEFAULT 'CADDY_ON_DEMAND' CHECK(provider IN ('CADDY_ON_DEMAND','CLOUDFLARE_SAAS')), failure_reason text, verified_at timestamptz, activated_at timestamptz, disabled_at timestamptz, last_checked_at timestamptz, consecutive_failures integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), CHECK(NOT canonical OR status='ACTIVE')
);
CREATE UNIQUE INDEX custom_domains_claimed ON shop.custom_domains(hostname) WHERE status IN ('PENDING_TLS','ACTIVE');
CREATE UNIQUE INDEX custom_domains_one_canonical ON shop.custom_domains(tenant_id) WHERE canonical;
CREATE INDEX custom_domains_tenant ON shop.custom_domains(tenant_id,status);
CREATE POLICY domain_resolver ON shop.custom_domains FOR SELECT TO migration_user USING(true);
CREATE OR REPLACE FUNCTION shop.resolve_store(route text, by_host boolean) RETURNS TABLE(tenant_id uuid,canonical text,slug text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$
 SELECT r.tenant_id,r.canonical,r.slug FROM shop.platform_routes r WHERE CASE WHEN by_host THEN r.hostname=route ELSE r.slug=route END
 UNION ALL SELECT r.tenant_id,r.canonical,r.slug FROM shop.custom_domains d JOIN shop.platform_routes r ON r.tenant_id=d.tenant_id WHERE by_host AND d.hostname=route AND d.status IN ('PENDING_TLS','ACTIVE') $$;
-- TLS issuance permission (Caddy "ask"): only hostnames already proven by a store.
CREATE FUNCTION shop.tls_allowed(host text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$ SELECT exists(SELECT 1 FROM shop.custom_domains d WHERE d.hostname=host AND d.status IN ('PENDING_TLS','ACTIVE')) $$;
-- Platform administration lists stores by routing metadata only; everything else is read per tenant under RLS.
CREATE POLICY tenant_directory ON shop.tenants FOR SELECT TO migration_user USING(true);
CREATE FUNCTION shop.platform_tenants() RETURNS TABLE(tenant_id uuid,slug text,name text,lifecycle_status text,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$ SELECT t.id,t.slug,t.name,t.lifecycle_status,t.created_at FROM shop.tenants t ORDER BY t.created_at $$;
REVOKE ALL ON FUNCTION shop.tls_allowed(text),shop.platform_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shop.tls_allowed(text),shop.platform_tenants() TO app_user;
-- ---- Frete por provedor (seção 10): configuração por loja e cotações rastreáveis.
ALTER TABLE shop.shipping_rules DROP CONSTRAINT shipping_rules_kind_check;
ALTER TABLE shop.shipping_rules ADD CONSTRAINT shipping_rules_kind_check CHECK(kind IN ('PICKUP','TABLE','CARRIER'));
CREATE TABLE shop.shipping_providers (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), provider text NOT NULL CHECK(provider IN ('SIMULATED','MELHOR_ENVIO')), enabled boolean NOT NULL DEFAULT true,
 origin_cep text NOT NULL CHECK(origin_cep ~ '^[0-9]{8}$'), rule_id uuid NOT NULL, simulation jsonb NOT NULL DEFAULT '{}', credentials_cipher text, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,rule_id) REFERENCES shop.shipping_rules(tenant_id,id)
);
ALTER TABLE shop.shipping_quotes ADD COLUMN provider text, ADD COLUMN provider_service text, ADD COLUMN provider_quote_ref text, ADD COLUMN days integer, ADD COLUMN package jsonb;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['subscriptions','subscription_events','saas_invoices','saas_billing_inbox','simulated_saas_charges','media_reservations','refund_requests','custom_domains','shipping_providers'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON shop.subscriptions,shop.saas_billing_inbox,shop.simulated_saas_charges,shop.media_reservations,shop.refund_requests,shop.custom_domains,shop.shipping_providers TO app_user;
GRANT SELECT,INSERT ON shop.subscription_events,shop.saas_invoices TO app_user;
-- Invoice amounts are immutable after issue; only lifecycle fields change.
GRANT UPDATE(status,paid_at,provider_ref,charge_requested_at) ON shop.saas_invoices TO app_user;
GRANT SELECT ON shop.subscriptions,shop.subscription_events,shop.saas_invoices,shop.saas_billing_inbox,shop.simulated_saas_charges,shop.media_reservations,shop.refund_requests,shop.custom_domains,shop.shipping_providers TO backup_user;
