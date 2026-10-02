CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA shop;
CREATE FUNCTION shop.search_text(text) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,shop AS $$ SELECT lower(shop.unaccent($1)) $$;
GRANT EXECUTE ON FUNCTION shop.search_text(text) TO app_user;

CREATE TABLE shop.categories (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), name text NOT NULL, slug text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,slug), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shop.products (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), category_id uuid,
 name text NOT NULL, slug text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','ARCHIVED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,slug),
 FOREIGN KEY(tenant_id,category_id) REFERENCES shop.categories(tenant_id,id)
);
CREATE TABLE shop.product_slugs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, slug text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,slug), FOREIGN KEY(tenant_id,product_id) REFERENCES shop.products(tenant_id,id)
);
CREATE TABLE shop.product_variants (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, sku text NOT NULL,
 attributes jsonb NOT NULL DEFAULT '{}', combination_key text NOT NULL, is_default boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 price_cents bigint NOT NULL CHECK(price_cents>=0), weight_g integer NOT NULL DEFAULT 0 CHECK(weight_g>=0), width_mm integer NOT NULL DEFAULT 0 CHECK(width_mm>=0), height_mm integer NOT NULL DEFAULT 0 CHECK(height_mm>=0), length_mm integer NOT NULL DEFAULT 0 CHECK(length_mm>=0),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,sku), UNIQUE(tenant_id,product_id,combination_key), FOREIGN KEY(tenant_id,product_id) REFERENCES shop.products(tenant_id,id)
);
CREATE TABLE shop.inventory_locations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), name text NOT NULL, UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
CREATE TABLE shop.inventory_items (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), variant_id uuid NOT NULL, location_id uuid NOT NULL,
 on_hand integer NOT NULL DEFAULT 0, reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0 AND on_hand>=reserved),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,variant_id,location_id), FOREIGN KEY(tenant_id,variant_id) REFERENCES shop.product_variants(tenant_id,id), FOREIGN KEY(tenant_id,location_id) REFERENCES shop.inventory_locations(tenant_id,id)
);
CREATE TABLE shop.inventory_movements (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), item_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 delta integer NOT NULL, balance integer NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,item_id) REFERENCES shop.inventory_items(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE TABLE shop.media_assets (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), actor_membership_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('UPLOADING','PENDING','READY','FAILED','DELETED')), original_key text NOT NULL, content_hash text NOT NULL,
 original_bytes bigint NOT NULL DEFAULT 0 CHECK(original_bytes>=0), stored_bytes bigint NOT NULL DEFAULT 0 CHECK(stored_bytes>=0), renditions jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES shop.tenant_memberships(tenant_id,id)
);
CREATE TABLE shop.product_media (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, asset_id uuid NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,product_id,asset_id), FOREIGN KEY(tenant_id,product_id) REFERENCES shop.products(tenant_id,id), FOREIGN KEY(tenant_id,asset_id) REFERENCES shop.media_assets(tenant_id,id)
);
CREATE TABLE shop.merchant_profiles (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), profile jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE shop.theme_revisions (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), schema_version integer NOT NULL CHECK(schema_version=1), content jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE shop.theme_media (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), revision_id uuid NOT NULL, asset_id uuid NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,revision_id,asset_id), FOREIGN KEY(tenant_id,revision_id) REFERENCES shop.theme_revisions(tenant_id,id), FOREIGN KEY(tenant_id,asset_id) REFERENCES shop.media_assets(tenant_id,id)
);
CREATE TABLE shop.storefronts (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), draft_revision_id uuid, published_revision_id uuid, version bigint NOT NULL DEFAULT 0,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,draft_revision_id) REFERENCES shop.theme_revisions(tenant_id,id), FOREIGN KEY(tenant_id,published_revision_id) REFERENCES shop.theme_revisions(tenant_id,id)
);
CREATE TABLE shop.platform_routes (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES shop.tenants(id), hostname text NOT NULL UNIQUE, slug text NOT NULL UNIQUE, canonical text NOT NULL,
 UNIQUE(tenant_id,id)
);
CREATE TABLE shop.storefront_events (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), version bigint NOT NULL, operation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE shop.carts (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), token_hash text NOT NULL, version bigint NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,token_hash)
);
CREATE TABLE shop.cart_items (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), cart_id uuid NOT NULL, variant_id uuid NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 0 AND 99),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,cart_id,variant_id), FOREIGN KEY(tenant_id,cart_id) REFERENCES shop.carts(tenant_id,id), FOREIGN KEY(tenant_id,variant_id) REFERENCES shop.product_variants(tenant_id,id)
);
CREATE TABLE shop.shipping_rules (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('PICKUP','TABLE')),
 cep_start text NOT NULL CHECK(cep_start ~ '^[0-9]{8}$'), cep_end text NOT NULL CHECK(cep_end ~ '^[0-9]{8}$' AND cep_end>=cep_start), price_cents bigint NOT NULL CHECK(price_cents>=0), days integer NOT NULL CHECK(days>=0), priority integer NOT NULL, version bigint NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,id)
);
CREATE TABLE shop.shipping_quotes (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), cart_id uuid NOT NULL, rule_id uuid NOT NULL, fingerprint text NOT NULL,
 address jsonb NOT NULL, price_cents bigint NOT NULL CHECK(price_cents>=0), expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,cart_id) REFERENCES shop.carts(tenant_id,id), FOREIGN KEY(tenant_id,rule_id) REFERENCES shop.shipping_rules(tenant_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['categories','products','product_slugs','product_variants','inventory_locations','inventory_items','inventory_movements','media_assets','product_media','merchant_profiles','theme_revisions','theme_media','storefronts','platform_routes','storefront_events','carts','cart_items','shipping_rules','shipping_quotes'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING (tenant_id=shop.current_tenant()) WITH CHECK (tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
-- Only routing identifiers are visible to the definer; no business-table exception.
CREATE POLICY routing_resolver ON shop.platform_routes FOR SELECT TO migration_user USING(true);
CREATE FUNCTION shop.resolve_store(route text, by_host boolean) RETURNS TABLE(tenant_id uuid,canonical text,slug text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,shop AS $$ SELECT r.tenant_id,r.canonical,r.slug FROM shop.platform_routes r WHERE CASE WHEN by_host THEN r.hostname=route ELSE r.slug=route END $$;
REVOKE ALL ON FUNCTION shop.resolve_store(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shop.resolve_store(text,boolean) TO app_user;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA shop TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA shop TO backup_user;
REVOKE UPDATE ON shop.theme_revisions,shop.theme_media,shop.inventory_movements,shop.storefront_events FROM app_user;
