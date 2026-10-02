CREATE SCHEMA access;
CREATE SCHEMA shop;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE TABLE access.users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)), password_hash text NOT NULL,
 verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE access.sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES access.users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE access.tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES access.users(id), kind text NOT NULL CHECK (kind IN ('VERIFY','RECOVERY')),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shop.tenants (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL CHECK (tenant_id = id), slug text NOT NULL UNIQUE,
 name text NOT NULL, lifecycle_status text NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','ACTIVE','SUSPENDED')),
 timezone text NOT NULL DEFAULT 'America/Sao_Paulo', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id)
);
CREATE TABLE shop.tenant_memberships (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), user_id uuid NOT NULL REFERENCES access.users(id),
 role text NOT NULL CHECK (role IN ('OWNER','EMPLOYEE')), status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id), UNIQUE (tenant_id,user_id)
);
CREATE TABLE shop.store_settings (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
 timezone text NOT NULL DEFAULT 'America/Sao_Paulo', updated_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,updated_by_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE TABLE shop.invitations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), email text NOT NULL,
 role text NOT NULL DEFAULT 'EMPLOYEE' CHECK (role = 'EMPLOYEE'), token_hash text NOT NULL UNIQUE,
 inviter_membership_id uuid NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,inviter_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE FUNCTION shop.current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
CREATE FUNCTION shop.current_actor() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_user_id',true),'')::uuid $$;
ALTER TABLE shop.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON shop.tenants USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant());
ALTER TABLE shop.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.tenant_memberships FORCE ROW LEVEL SECURITY;
-- Sem tenant, somente os IDs/vínculos do ator autenticado podem ser enumerados; nenhum dado de loja.
CREATE POLICY membership_read ON shop.tenant_memberships FOR SELECT USING (tenant_id=shop.current_tenant() OR (shop.current_tenant() IS NULL AND user_id=shop.current_actor()));
CREATE POLICY membership_insert ON shop.tenant_memberships FOR INSERT WITH CHECK (tenant_id=shop.current_tenant());
CREATE POLICY membership_update ON shop.tenant_memberships FOR UPDATE USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant());
ALTER TABLE shop.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.store_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY setting_scope ON shop.store_settings USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant());
ALTER TABLE shop.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_scope ON shop.invitations USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant());
GRANT USAGE ON SCHEMA access TO auth_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA access TO auth_user;
GRANT USAGE ON SCHEMA shop TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA shop TO app_user;
REVOKE ALL ON FUNCTION shop.current_tenant(), shop.current_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shop.current_tenant(), shop.current_actor() TO app_user, migration_user;
-- Backup precisa ler todos os tenants sem desabilitar FORCE RLS; papel operacional somente-leitura.
GRANT USAGE ON SCHEMA access, shop, migrations TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA access, shop, migrations TO backup_user;
