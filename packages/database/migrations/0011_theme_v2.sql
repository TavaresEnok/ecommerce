-- Tema v2 (personalização da loja): presets, identidade, layout e seções tipadas, validados pela API (apps/api/src/theme.ts).
-- Aditiva: revisões v1 continuam válidas e são lidas convertidas para v2; nenhuma linha existente é reescrita.
ALTER TABLE shop.theme_revisions DROP CONSTRAINT IF EXISTS theme_revisions_schema_version_check;
ALTER TABLE shop.theme_revisions ADD CONSTRAINT theme_revisions_schema_version_check CHECK (schema_version IN (1, 2));
-- Histórico de publicações: as revisões com o fornecedor congelado são lidas por data; índice por loja e data.
CREATE INDEX IF NOT EXISTS theme_revisions_tenant_created_idx ON shop.theme_revisions (tenant_id, created_at DESC);
