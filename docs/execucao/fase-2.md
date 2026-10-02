# Fase 2 — loja navegável

- **Especificação:** v1.1; execução limitada a `prompts/fase-2-loja-navegavel.md`.
- **Estado:** **CONCLUÍDA — verificações locais**.
- **Liberação operacional:** **NÃO_SOLICITADA**. Nenhuma produção/piloto externo foi publicado.
- **Data:** 01/10/2026.
- **Resultado final:** `node scripts/verify.mjs --phase=2` → **código 0**, em `ecommerce-phase2-test`.
- **Versão verificada (SHA-256 das fontes):** `a7a45ddd3f084d4e544b96865e4f7f0cf73072970633f77dbef211d91eb14512`.
- **Evidência principal:** [`evidencias/fase-2/verification.json`](evidencias/fase-2/verification.json).

## 1. Entregue

1. **Catálogo funcional:** produtos DRAFT/ACTIVE/ARCHIVED; categoria; slug com histórico/redirecionamento; SKU único por tenant; variante padrão para simples e atributos/variantes explícitos. A conversão desativa a variante padrão atomicamente. Preços em BIGINT/centavos e strings decimais na API.
2. **Atributos relacionais:** `product_options`, `option_values` e `variant_values`, com FKs compostas por tenant e produto. Mapa JSON da API é uma representação derivada, não fonte dos relacionamentos. Migration aditiva converte dados locais existentes sem apagá-los.
3. **Estoque:** `inventory_items` é a única fonte do saldo por variação/local; ajustes serializados, responsável, motivo, delta e saldo final registrados em trilha append-only. Carrinho não reserva nem baixa estoque.
4. **Mídia real:** bucket S3 local privado e autenticado (SeaweedFS 4.17); JPEG/PNG/WebP estáticos validados por conteúdo/decodificação e dimensões; Sharp gera WebP 480/1280 sem metadados originais. Objetos versionados/prefixados por tenant. Referências tipadas de catálogo/tema, acesso privado autorizado e acesso público somente a mídia READY referenciada em conteúdo público.
5. **Política de mídia do piloto:** até 10 MiB/40 MP por original, duas admissões simultâneas por tenant, validação global limitada, worker de imagem concorrência 1, timeout e limite de 8 MiB derivados. Cota 1 GiB com tolerância limitada pelos uploads admitidos; contagem real inclusive órfãos e reconciliação horária. Temporários expiram em 24 h; manutenção autorizada pode reconciliar e retomar pendências. `UPLOADS_DISABLED=true` no ambiente bloqueia novas admissões. Não é a reserva comercial rigorosa de T38.
6. **Tema/vitrine:** revisões imutáveis `schema_version=1`, ponteiros separados de rascunho/publicado, preview autorizado, páginas/menu internos, fonte/cor/mensagem/mídia configuráveis. Publicação verifica disponibilidade da mídia fora de locks e troca ponteiros/snapshot do fornecedor atomicamente; falha preserva a versão anterior. Texto do lojista não executa HTML/JS. Publicação não reativa tenant suspenso.
7. **Fornecedor e SEO:** perfil com identificação, endereço/contato, cuidados, entrega/restrições e políticas conservadas na revisão publicada. Demonstrações são TESTE, sem identidade fiscal real inventada. Title/description/canonical, sitemap, robots e Product/Offer JSON-LD por loja; preview/painel/carrinho não aparecem no sitemap. Noindex no ambiente local; autorização não depende de robots.
8. **Busca:** PostgreSQL, unaccent explícito, tsvector/dicionário português, índice GIN parcial de produtos ativos e busca por SKU. Consulta pública sempre scoped ao tenant. EXPLAIN ANALYZE executado como app_user antes de criar o índice e novamente na suíte.
9. **Carrinho/frete:** cookie opaco HttpOnly/SameSite por loja e hash no banco; IDs não autorizam outro carrinho. Quantidades validadas e preços/total recalculados no servidor com BigInt. Retirada e tabela de CEP com prioridade/desempate determinístico. Cotação identificada, válida por 15 minutos e correlacionada a endereço, itens/preços/dimensões e versão da regra. Preço, quantidade, dimensões, endereço, regra ou expiração invalidam a cotação. CEP sem método é erro, nunca frete grátis inventado.
10. **Demonstração:** seed seguro de duas lojas sintéticas, painel de catálogo real, vitrine navegável, carrinho e aviso explícito de que compra/pagamento ainda não estão habilitados.

**Não implementado nesta fase:** checkout que conclui compra, pedidos, reservas, pagamentos/webhooks, cobrança SaaS, reembolso, cupons, domínio de cliente, frete externo ou IA. Nenhuma dessas integrações foi simulada como sucesso financeiro.

## 2. Arquivos principais

- `packages/database/migrations/0002_storefront.sql`, `0003_media_accounting.sql`, `0004_catalogue_contracts.sql` e `packages/database/src/schema.ts`.
- `packages/database/src/index.ts`: ator público nulo explícito, contexto transacional local preservado.
- `apps/api/src/catalogue.ts`, `storefront.ts`, `cart.ts`; integração em `main.ts`/exportação da autorização em `stores.ts`.
- `packages/media/src/index.ts`; jobs/reconciliação em `apps/worker/src/main.ts`.
- `apps/web/app/painel/[tenantId]/page.tsx`, `preview/[tenantId]/page.tsx`, `lojas/[slug]/...`, `components/storefront.tsx` e `proxy.ts`.
- `compose.yaml`, `compose.phase2.test.yaml`, `Dockerfile`, `scripts/setup.mjs`, `seed.mjs`, `check-storage.mjs`, `verify.mjs`.
- `tests/storefront.test.mjs`, `tests/storefront-restore.test.mjs`; regressões em `tests/foundation.test.mjs`/`restore.test.mjs`.
- `README.md` e [`../decisoes/loja-navegavel.md`](../decisoes/loja-navegavel.md).

Migration 0001 e relatório/evidência históricos da Fase 1 foram preservados. Não foram criados commits/branches; o diretório não contém repositório Git inicializado.

## 3. Verificações efetivamente executadas

Ambiente autoritativo: Docker Linux no Docker Desktop, Node **24.21.0**, npm **11.6.2**, PostgreSQL **17.9**, Redis **7.4.7**, S3 local **SeaweedFS 4.17**. Node 25 do host foi usado apenas para scripts de orquestração/HTTP, não como runtime homologado de build/testes.

| Verificação | Resultado final |
|---|---|
| `node scripts/verify.mjs --phase=2` | **0**, build, migrations, tipos, testes, logs, reinício S3 e restore executados |
| `tests/storefront.test.mjs` | **12 testes contabilizados pelo Node** (11 subtestes + teste pai), todos aprovados |
| Regressões `tests/foundation.test.mjs` | **13 testes** (12 subtestes + teste pai), todos aprovados |
| `tests/restore.test.mjs` + `tests/storefront-restore.test.mjs` | **2 testes**, aprovados |
| Total | **27**, nenhuma falha, cancelamento, teste ignorado ou TODO |
| `npm audit --omit=dev` | **0 vulnerabilidades** no lockfile atual |
| Atualização do desenvolvimento `docker compose up -d --wait --wait-timeout 150 web worker` | Aprovada, dados e acessos existentes preservados |
| `node scripts/seed.mjs --local` | Duas lojas TESTE criadas, sem apagar dados; acessos aleatórios em arquivo local ignorado |
| Playwright MCP complementar | Vitrine, variação explícita, persistência do carrinho, isolamento, busca portuguesa, frete e viewport conferidos |

### Critérios e casos

- **T01/T02:** app_user real sem owner/superuser/BYPASSRLS; ENABLE/FORCE em todas as tabelas de loja; negação sem contexto, alternância A/B na mesma conexão, commit/rollback e endpoints privados cruzados negados.
- **FKs de catálogo — T03 parcial:** estoque/mídia/atributos rejeitam referências de outra loja e de produto incompatível. T03 de `order_items` não foi executado porque pedido só entra na Fase 3.
- **T22:** alternância de lojas/query/cache, SKU da outra loja não retorna resultado; `cafe`, `CAFÉS`, `calçado`, `calcado`, `CALÇADOS`; preview privado não substitui conteúdo publicado. Revisão imutável, publicação obsoleta/mídia pendente/objeto ausente recusadas mantendo a publicação anterior.
- **T23:** SVG inválido, arquivo acima de 10 MiB e imagem acima de 40 MP recusados; concorrência limitada; WebP real; S3 anônimo negado; mídia de A negada em B; cota cheia bloqueia, admissões próximas ao limite têm excesso limitado e reconciliação corrige contadores; temporário vencido removido. Para o caso perto de 1 GiB, a suíte injeta deliberadamente deriva no contador, com objetos reais pequenos: **não foi feito upload de 1 GiB nem provada reserva comercial**.
- **T37:** canonical/sitemap/robots/JSON-LD e preço/disponibilidade por loja; páginas privadas fora do sitemap; preview sem cookie negado, preview autorizado noindex; hostname desconhecido e hostname/slug incompatíveis negados; histórico de slug redireciona e impede reutilização indevida. Domínio próprio não ativado/testado.
- **Preço/carrinho/frete:** simples e explícito usam variant_id; variante padrão convertida não comprável; quantidade fracionária/acima do saldo recusada; visitante de outro carrinho não valida cotação alheia; alteração de preço, quantidade, dimensões, endereço ou regra e expiração invalidam cotação; arquivamento invalida oferta/carrinho; retirada/tabela/CEP não atendido; saldo/reserved inalterados pelo carrinho.
- **Restore:** banco separado `ecommerce_restore`; configurações/vínculos, produtos, saldos, ponteiro publicado, carrinhos/itens/cotações e RLS preservados. Bucket reiniciado com volume persistente, prontidão S3 autenticada conferida e todas as rendições READY referenciadas pelas fixtures continuam legíveis. **Não é restore externo do bucket**.

### Falhas encontradas e corrigidas

- Tipagem explícita de rendições e retorno da cotação.
- Timeout inicial no clique, não reproduzido na repetição diagnóstica. Hidratação foi uma hipótese, não causa comprovada; a interface passou a impedir submissão pré-hidratação, deixando o botão desabilitado até estar interativo. Repetições integrais posteriores passaram.
- Teste de Host usando fetch não enviava o Host pretendido no Node atual: substituído por http.request e verificação efetiva de hostname/isolamento.
- Reconciliação/contagem de objetos órfãos e admissão concorrente reforçadas; limpeza/retomada de uploads com operação durável no banco.
- S3 ainda inicializando após restart apesar do container ativo: runner agora espera HeadBucket autenticado do bucket existente, sem recriá-lo para ocultar perda de dados.
- Relatório consultava estado do teste pai antes de conclusão: coleta agora registra subtestes efetivamente executados, incluindo reprovações, sem reduzir as asserções.
- Revisão final corrigiu atributos para relações/FKs e acrescentou configuração portuguesa/GIN após EXPLAIN. Detalhe de produto e sitemap usam consultas próprias, não dependem da primeira página da listagem.

Tentativas anteriores com código 1 não foram apresentadas como aprovação; o resultado acima é da repetição integral após correções. Não houve homologação externa.

## 4. Conferência visual e evidências

- Playwright integrado: **1440×900** e **390×844**; catálogo, busca, produto, carrinho/frete, painel e preview autorizado. Sem overflow horizontal ou exceção JavaScript no fluxo verificado.
- MCP complementar: lojas locais Aurora/Brisa; variante Verde/M, carrinho preservado após reload e migration relacional; preço 5100 centavos, entrega 1500 e total 6600; CEP inválido para a tabela gera mensagem explícita; Brisa continua com carrinho vazio no mesmo navegador; busca `CAFÉS` encontra café; Tab/Enter no link de conteúdo.
- Inspeção visual: rótulos, mensagens, conteúdo e controles visíveis, layout móvel em coluna e foco/navegação utilizáveis. Sem referência de pixel perfeito ou auditoria completa WCAG.
- [`evidencias/fase-2/manual.json`](evidencias/fase-2/manual.json), [`mcp-desktop.png`](evidencias/fase-2/mcp-desktop.png), [`mcp-mobile.png`](evidencias/fase-2/mcp-mobile.png).
- Screenshots automatizadas temporárias: `artifacts/phase2-store-1440.png`, `phase2-store-390.png`, `phase2-admin-1440.png`, `phase2-admin-390.png`.
- Plano antes do GIN: [`search-before-index.json`](evidencias/fase-2/search-before-index.json); plano posterior dentro de `verification.json`. Medição com fixture pequena, não ensaio de capacidade/p95.
- Console: 404 esperado no CEP não atendido; favicon ausente observado inicialmente, sem impacto no fluxo. Não foi tratado como falha de negócio nem homologação visual externa.

## 5. Decisões e limites

- Monólito/stack e autorização da fundação preservados. Owner publica/configura fornecedor/tema/frete; Owner/Employee gerenciam catálogo/mídia/estoque. Ator público é nulo explícito, nunca usuário global fictício.
- Resolução SECURITY DEFINER retorna somente tenant/slug/canonical, com exceção SELECT restrita à tabela de roteamento e ao papel definidor. Aplicação nunca recebe credencial de migration/backup.
- Cache de memória limitado a 200 entradas/30 segundos com tenant, revisão, versão, canonical e query/categoria; estado/lifecycle consultados antes de cache. Mudança de negócio inclui evento durável/versionamento na mesma transação. HTTP privado, preview e carrinho são no-store.
- Atributos limitados a 5 opções por combinação nesta interface; conteúdo/pages/menu/cores/fontes validados, sem código do lojista. Páginas/políticas são preservadas em snapshots imutáveis do tema; mídias continuam com referências tipadas.
- Listagem/busca limitada a 100 produtos por consulta nesta interface de piloto; detalhe público e sitemap não truncam à primeira listagem. Paginação/gestão em escala maior e benchmark de capacidade não foram homologados nesta fase.
- Publicação comercial real bloqueada até domínio/ativação apropriados; demonstração somente local. `*.localhost` é subdomínio gerenciado local, não domínio de cliente.

## 6. Como executar e demonstrar

```sh
npm ci
npm run setup
node scripts/setup.mjs --test
docker compose up --build -d --wait web worker
node scripts/seed.mjs --local
node scripts/verify.mjs --phase=2
```

`setup` preserva variáveis/segredos existentes e adiciona somente chaves ausentes, sem imprimir valores. Build/testes usam Node LTS no Docker. Migrations executam pelo serviço `migrate`; não editar migrations aplicadas.

**Demonstração já criada nesta máquina:**

- http://localhost:3000/lojas/aurora-ccf985a553
- http://localhost:3000/lojas/brisa-ccf985a553
- Canônico local: `http://aurora-ccf985a553.localhost:3000` e equivalente Brisa. Se a rede/navegador não resolver *.localhost, usar a rota de conveniência acima.

Acessos aleatórios estão em `.local/demo.json` (não versionar/compartilhar; nenhum segredo neste relatório). Entre no portal http://localhost:3000, selecione a loja e **Gerenciar catálogo e vitrine**. Cadastre produto/categoria, ajuste saldo com motivo/local, envie imagem, atualize processamento, vincule mídia, salve fornecedor TESTE e rascunho, veja preview autorizado e publique. Na vitrine, busque, selecione variação e cote CEP `01001000`, retirada ou `99999999` para erro. Não há botão de confirmação financeira.

Diagnóstico: `docker compose ps`; `docker compose logs --tail=100 api worker storage-init migrate`. O painel permite **Reconciliar mídia e retomar pendências**. Para interromper novas admissões, configurar `UPLOADS_DISABLED=true` e recriar a API. Falhas de storage/filas são explícitas; não declarar upload/publicação concluídos sem persistência.

Backup/restore PostgreSQL: seguir `docs/backup-e-restore.md`. Dumps preservam referências, não objetos S3. **Preservar volume storage-data**; backup externo do bucket é pendência D04, não substituir por dump do banco.

O runner apaga SOMENTE volumes sintéticos do projeto reservado `ecommerce-phase2-test`, porta 3200, nunca volumes de desenvolvimento. Containers de teste foram parados após os ensaios, sem apagar os volumes/evidências; desenvolvimento permanece ativo em localhost:3000. Para parar teste:

```sh
docker compose --project-name ecommerce-phase2-test --env-file .local/test.env -f compose.yaml -f compose.test.yaml -f compose.phase2.test.yaml down
```

Não usar `down --volumes` no desenvolvimento se quiser preservar dados.

## 7. Pendências e próximo passo

| Pendência | Responsável | Efeito |
|---|---|---|
| D03 domínio/DNS/TLS/rota pública da plataforma | Responsável + operação | Antes do piloto público; não bloqueia esta fase local |
| D04 storage S3 externo, backup/cifra/recuperação de bucket | Operação | Antes de dados reais; S3 local não é homologação externa |
| D05 provedor/remetente de e-mail | Operação | E-mail local não prova entrega/posse real; antes do piloto |
| D08 dados/políticas reais, termos e atendimento | Responsável/lojistas/assessoria | Antes de ativação real; perfis presentes são sintéticos |
| D06 capacidade/monitoramento/cobertura de incidente | Responsável + operação | Ensaio/ativação nas fases pertinentes; não foi declarado benchmark aprovado |
| Contrato e homologação Mercado Pago da Fase 0 | Desenvolvimento + titular autorizado | Antes dos fluxos financeiros reais da Fase 3 |

**Ponto de parada cumprido:** duas vitrines independentes e dados persistidos, catálogo/mídia/tema/busca/carrinho/frete navegáveis e verificações locais concluídas. Nenhum impedimento externo impede concluir a Fase 2 local.

**Próximo passo exato:** somente mediante nova instrução, executar `prompts/fase-3-compra-e-pagamentos.md`, considerando o contrato de pagamento derivado da Fase 0 e as pendências externas. **Fase 3 não iniciada.**
