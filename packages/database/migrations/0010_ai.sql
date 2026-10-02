-- Fase 7: rascunho de descrição com IA, com orçamento reservado antes da chamada e conciliado depois.
-- Valores monetários em micro-USD (inteiros): o provedor cobra em dólar por token.
CREATE TABLE platform.ai_policy (
 id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false, provider text NOT NULL DEFAULT 'ANTHROPIC' CHECK(provider IN ('ANTHROPIC','SIMULATED')), model text NOT NULL,
 input_micros_per_token bigint NOT NULL CHECK(input_micros_per_token>=0), output_micros_per_token bigint NOT NULL CHECK(output_micros_per_token>=0), price_reference text NOT NULL,
 max_input_chars integer NOT NULL CHECK(max_input_chars BETWEEN 100 AND 20000), max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 256 AND 16000),
 tenant_monthly_limit_micros bigint NOT NULL CHECK(tenant_monthly_limit_micros>=0), global_monthly_limit_micros bigint NOT NULL CHECK(global_monthly_limit_micros>=0),
 tenant_concurrency integer NOT NULL DEFAULT 1 CHECK(tenant_concurrency BETWEEN 1 AND 5), global_concurrency integer NOT NULL DEFAULT 4 CHECK(global_concurrency BETWEEN 1 AND 50),
 version integer NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
-- Disabled by default (D11). Prices: Claude Opus 5.5 first-party rates, US$4 / US$20 per million tokens (skill reference cached 2026-09-25).
INSERT INTO platform.ai_policy(id,enabled,provider,model,input_micros_per_token,output_micros_per_token,price_reference,max_input_chars,max_output_tokens,tenant_monthly_limit_micros,global_monthly_limit_micros,updated_by)
 VALUES(1,false,'ANTHROPIC','claude-opus-5-5',4,20,'anthropic-api-2026-09-25',4000,4000,2000000,20000000,'migration');
CREATE TABLE platform.ai_global_usage (
 period date PRIMARY KEY, reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0), spent_micros bigint NOT NULL DEFAULT 0 CHECK(spent_micros>=0), running integer NOT NULL DEFAULT 0 CHECK(running>=0)
);
CREATE TABLE shop.ai_settings (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), enabled boolean NOT NULL DEFAULT false, monthly_limit_micros bigint CHECK(monthly_limit_micros IS NULL OR monthly_limit_micros>=0),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE shop.ai_usage (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), period date NOT NULL, reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0), spent_micros bigint NOT NULL DEFAULT 0 CHECK(spent_micros>=0), running integer NOT NULL DEFAULT 0 CHECK(running>=0),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,period)
);
CREATE TABLE shop.ai_generations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, operation_key text NOT NULL, period date NOT NULL,
 status text NOT NULL CHECK(status IN ('RESERVED','SUCCEEDED','FAILED','UNKNOWN','RELEASED','SAVED','DISCARDED')),
 provider text NOT NULL, model text NOT NULL, policy_version integer NOT NULL, price_reference text NOT NULL, reserved_micros bigint NOT NULL CHECK(reserved_micros>=0),
 input_tokens integer, output_tokens integer, cost_micros bigint CHECK(cost_micros IS NULL OR cost_micros>=0), stop_reason text, draft text CHECK(draft IS NULL OR length(draft)<=8000),
 base_updated_at timestamptz NOT NULL, error_code text, actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,operation_key), FOREIGN KEY(tenant_id,product_id) REFERENCES shop.products(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE INDEX ai_generations_open ON shop.ai_generations(tenant_id,created_at) WHERE status IN ('RESERVED','UNKNOWN');
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_settings','ai_usage','ai_generations'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
GRANT SELECT,UPDATE ON platform.ai_policy TO app_user;
GRANT SELECT,INSERT,UPDATE ON platform.ai_global_usage,shop.ai_settings,shop.ai_usage,shop.ai_generations TO app_user;
GRANT SELECT ON platform.ai_policy,platform.ai_global_usage,shop.ai_settings,shop.ai_usage,shop.ai_generations TO backup_user;
