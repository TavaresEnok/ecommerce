ALTER TABLE shop.product_variants ADD CONSTRAINT variant_product_identity UNIQUE(tenant_id,product_id,id);
CREATE TABLE shop.product_options (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,product_id,id), UNIQUE(tenant_id,product_id,name),
 FOREIGN KEY(tenant_id,product_id) REFERENCES shop.products(tenant_id,id)
);
CREATE TABLE shop.option_values (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, option_id uuid NOT NULL, value text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,product_id,option_id,id), UNIQUE(tenant_id,option_id,value),
 FOREIGN KEY(tenant_id,product_id,option_id) REFERENCES shop.product_options(tenant_id,product_id,id)
);
CREATE TABLE shop.variant_values (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES shop.tenants(id), product_id uuid NOT NULL, variant_id uuid NOT NULL, option_id uuid NOT NULL, value_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,variant_id,option_id),
 FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES shop.product_variants(tenant_id,product_id,id),
 FOREIGN KEY(tenant_id,product_id,option_id,value_id) REFERENCES shop.option_values(tenant_id,product_id,option_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['product_options','option_values','variant_values'] LOOP
 EXECUTE format('ALTER TABLE shop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE shop.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON shop.%I USING(tenant_id=shop.current_tenant()) WITH CHECK(tenant_id=shop.current_tenant())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON shop.product_options,shop.option_values,shop.variant_values TO app_user;
GRANT SELECT ON shop.product_options,shop.option_values,shop.variant_values TO backup_user;

-- One-time upgrade preserves existing local catalogue data without privileged application roles.
CREATE FUNCTION shop.migration_uuidv7() RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE r text:=replace(gen_random_uuid()::text,'-',''); m text:=lpad(to_hex(floor(extract(epoch from clock_timestamp())*1000)::bigint),12,'0');
BEGIN RETURN (substr(m,1,8)||'-'||substr(m,9,4)||'-7'||substr(r,14,3)||'-'||substr(r,17,4)||'-'||substr(r,21,12))::uuid; END $$;
REVOKE ALL ON FUNCTION shop.migration_uuidv7() FROM PUBLIC;
CREATE POLICY migration_catalogue_tenants ON shop.tenants FOR SELECT TO migration_user USING(true);
DO $$ DECLARE t record; v record; a record; o uuid; ov uuid; BEGIN
 FOR t IN SELECT id FROM shop.tenants LOOP
 PERFORM set_config('app.current_tenant_id',t.id::text,true);
 FOR v IN SELECT id,product_id,attributes FROM shop.product_variants LOOP
 FOR a IN SELECT key,value FROM jsonb_each_text(v.attributes) LOOP
 INSERT INTO shop.product_options(id,tenant_id,product_id,name) VALUES(shop.migration_uuidv7(),t.id,v.product_id,a.key) ON CONFLICT(tenant_id,product_id,name) DO NOTHING;
 SELECT id INTO o FROM shop.product_options WHERE product_id=v.product_id AND name=a.key;
 INSERT INTO shop.option_values(id,tenant_id,product_id,option_id,value) VALUES(shop.migration_uuidv7(),t.id,v.product_id,o,a.value) ON CONFLICT(tenant_id,option_id,value) DO NOTHING;
 SELECT id INTO ov FROM shop.option_values WHERE option_id=o AND value=a.value;
 INSERT INTO shop.variant_values(id,tenant_id,product_id,variant_id,option_id,value_id) VALUES(shop.migration_uuidv7(),t.id,v.product_id,v.id,o,ov);
 END LOOP; END LOOP; END LOOP;
END $$;
DROP POLICY migration_catalogue_tenants ON shop.tenants;
DROP FUNCTION shop.migration_uuidv7();
ALTER TABLE shop.product_variants DROP COLUMN attributes;

-- Dictionary/configuration is fixed; changing it requires regeneration and reindexing.
CREATE FUNCTION shop.product_search(text) RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,shop AS $$ SELECT to_tsvector('portuguese'::regconfig,lower(shop.unaccent('shop.unaccent'::regdictionary,$1))) $$;
REVOKE ALL ON FUNCTION shop.product_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shop.product_search(text) TO app_user;
ALTER TABLE shop.products ADD COLUMN search_document tsvector GENERATED ALWAYS AS(shop.product_search(name||' '||description)) STORED;
-- EXPLAIN ANALYZE before this index: docs/execucao/evidencias/fase-2/search-before-index.json.
CREATE INDEX products_public_search ON shop.products USING gin(search_document) WHERE status='ACTIVE';
