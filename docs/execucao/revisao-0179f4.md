# Correção da revisão do commit 0179f4d

- **Data:** 02/10/2026
- **Commit revisado:** `0179f4d7fce0fedf31c866c8a9f9cfb48f66efde`
- **Escopo:** somente as correções de R1–R6. Nenhuma funcionalidade ou fase nova.
- **Estado de código verificado:** árvore de trabalho sobre `0179f4d`, ainda **sem commit** (`worktreeClean:false`), com `sourceDigest` `8397f9e64875415f653f002ea74b9d69ea28fda83fee1d15e1458e9b6cf1e3a7` registrado em `evidencias/fase-7/verification.json`. Depois das execuções só mudou `docs/execucao/`, que fica fora do digest. Ao commitar, o verificador registra o novo SHA na próxima execução.
- **Liberação operacional:** NÃO_SOLICITADA. Nada foi publicado.

Concordo com os seis achados. Todos foram reproduzidos ou confirmados no código antes da correção, e nenhum estava corrigido no estado atual.

## Situação por achado

| R | Situação | Teste de regressão |
|---|---|---|
| R1 — sessão sem MFA exporta dados | **Corrigido** | `tests/commercial.test.mjs`, item "MFA (TOTP)…" |
| R2 — limite compartilhado pelos visitantes | **Corrigido** | `tests/edge-check.mjs`, clientes A e B |
| R3 — web sem `PLATFORM_HOST` em produção | **Corrigido** | `scripts/staging.mjs edge` e `tests/edge-check.mjs` B; `tests/staging-check.mjs` |
| R4 — 16 KB global bloqueia upload | **Corrigido** | `tests/edge-check.mjs` B |
| R5 — `completed` com resultado `null` | **Corrigido** | `tests/foundation.test.mjs`, item "R5…" |
| R6 — verificador aprova sem evidência externa | **Corrigido** | `tests/external-evidence.test.mjs` e execução do verificador |

### R1 — MFA pendente agora é restrito no servidor

- **Causa:** o `SessionGuard` autenticava a sessão e conferia o CSRF, mas só algumas ações chamavam `requireMfa`.
- **Mudança na API:**
  - O controle agora é central. `SessionGuard` (`apps/api/src/access.ts`) chama `rejectPendingMfa`, que responde 403 `MFA_PENDING` a toda sessão com MFA ativo e ainda não verificado.
  - Só as rotas marcadas com `@AllowPendingMfa()` aceitam essa sessão: `GET auth/session`, `POST auth/logout`, `POST auth/revoke-all` e `POST auth/mfa/verify`.
  - `PlatformGuard` aplica a mesma regra.
  - O `requireMfa` continua nas ações financeiras, de plano e de domínio. Ele cobre o caso da conta que ainda **não habilitou** MFA.
- **Mudança na interface:**
  - O componente `apps/web/components/mfa-gate.tsx` mostra o desafio de MFA nas páginas do painel quando a sessão está pendente.
  - A página inicial pede o código logo após o login.
- **Teste:**
  - Uma nova sessão por senha de conta com MFA recebe 403 em 11 operações: listar lojas, ler configurações, pedidos, operação, catálogo, plano e IA, alterar configurações, criar exportação, **baixar exportação já existente** e console da plataforma.
  - A configuração continua inalterada depois das tentativas.
  - Após o código válido, a mesma sessão lê configurações e baixa a exportação (200).
  - A interface foi testada nos dois tamanhos de tela (`tests/commercial-ui.test.mjs`).

### R2 — identidade do cliente verificável atrás da borda

- **Causa:** `trustProxy:false` com chave por IP fazia a API contar todos os visitantes como o IP do serviço web. O Next repassa o `X-Forwarded-For` recebido sem alterar (verificado em `next/dist/server/base-server.js`), então ele não serve de prova de origem.
- **Mudança — identidade do cliente:**
  - O Caddy (`infra/sites.caddy`) **sobrescreve** `X-Client-IP` com o endereço TCP do cliente e acrescenta `X-Edge-Auth`, um segredo compartilhado `EDGE_PROXY_SECRET`. Valores enviados pelo cliente são descartados.
  - A API (`clientKey` em `apps/api/src/main.ts`) só usa `X-Client-IP` quando `X-Edge-Auth` confere em tempo constante. Caso contrário, usa o par TCP.
  - `X-Forwarded-For` continua ignorado.
  - As chamadas que o web faz no servidor em nome do visitante repassam o par de cabeçalhos (`apps/web/components/edge.ts`): renderização da vitrine, redirecionamentos e resolução de host. Assim a vitrine também conta por visitante.
- **Mudança — escopos de limite:**

  | Escopo | Rotas | Padrão em produção | Variável |
  |---|---|---|---|
  | Geral | demais rotas | 120/min | `RATE_LIMIT_PER_MINUTE` |
  | Credenciais | login, cadastro, recuperação, redefinição, verificação de e-mail, MFA | 10/min | `AUTH_RATE_LIMIT_PER_MINUTE` |
  | Administração da plataforma | `/platform/*` | 60/min | `PLATFORM_RATE_LIMIT_PER_MINUTE` |

  - Os limites contam por cliente e por rota.
  - Os valores não foram aumentados. Em teste, os limites continuam 1000.
  - Em produção, a API recusa iniciar sem `EDGE_PROXY_SECRET` de 32+ caracteres. O `npm run setup` gera o segredo.
- **Teste (`node scripts/staging.mjs edge`, caminho Caddy → web → API):**
  - O cliente A (host, pela porta publicada) recebe 429 na requisição 121, com limite de 120/min.
  - Cabeçalhos forjados não restauram o acesso: `X-Forwarded-For`, `X-Client-IP` com `X-Edge-Auth` inválido, e os três juntos.
  - Dentro da janela do A, o cliente B (contêiner, outro endereço) recebe 200 na API, no portal e em uma página da vitrine renderizada no servidor.
- **Observação do ensaio:** dois contêineres criados em sequência podem reutilizar o mesmo IP da rede Docker. Na primeira tentativa, isso fez A e B parecerem o mesmo cliente para a borda. Medido salto a salto pelo `x-ratelimit-remaining`, API e web estavam corretos. Por isso o cliente A roda no host.

### R3 — `PLATFORM_HOST` chega ao web em produção

- **Mudança no Compose:**
  - O `compose.yaml` passa `PLATFORM_HOST` ao web.
  - O `compose.production.yaml` exige a variável (`:?`) no web, na API e no Caddy, e o segredo da borda na API e no Caddy.
  - O staging deixou de sobrescrever `PLATFORM_HOST` no web e na API. Agora herda o valor do Compose base, exercitando a mesma propagação da produção.
- **Teste da configuração efetiva** (`docker compose -f compose.yaml -f compose.production.yaml --profile production config`, que não cria nada):
  - `PLATFORM_HOST` aparece no web, na API e no Caddy.
  - O segredo é igual na API e no Caddy.
  - O web não publica porta.
  - O `sites.caddy` está montado.
  - Sem `PLATFORM_HOST`, a configuração é recusada.
  - O `caddy validate` aprova o Caddyfile de produção.
- **Teste de roteamento no staging:**
  - O domínio principal abre o portal (200).
  - O subdomínio gerenciado `<slug>.localhost` abre a loja certa (`data-store`).
  - O domínio próprio passa pelo ciclo completo: prova TXT/CNAME, certificado sob demanda, ACTIVE, rota para a loja certa e canônico (`tests/staging-check.mjs`).
  - Hostname desconhecido é recusado: 404 no web e sem certificado na borda.
- **Limitação, sem funcionalidade nova:**
  - Subdomínios gerenciados existem só como `<slug>.localhost`. A publicação fora de development/test continua bloqueada por decisão anterior ("Domínio da plataforma não homologado", `apps/api/src/storefront.ts`).
  - A borda não emite certificado para nomes reservados.
  - O subdomínio `<slug>.PLATFORM_HOST` em produção depende de D03 e fica como pendência.

### R4 — limite por rota na borda

- **Mudança:** o `infra/sites.caddy`, compartilhado por produção e staging, aplica `request_body` de 10 MiB somente a `POST /api/tenants/{uuid}/catalogue/media`. Todas as demais rotas ficam com 16 KB. A API mantém tipo, tamanho, dimensão e concorrência.
- **Causa da lacuna de cobertura:** o staging usava um Caddyfile próprio, sem esse limite. Agora produção e staging importam o mesmo arquivo de sites e só mudam o emissor de certificado.
- **Teste pela borda:**

  | Requisição | Resultado |
  |---|---|
  | PNG válido gerado com pixels aleatórios (49.363 bytes na execução registrada) na rota de mídia | 201 |
  | 10 MiB + 1 KB na rota de mídia | 413 |
  | JSON de 20 KB em `PATCH settings` | 413 |
  | JSON comum em `PATCH settings` | 200 |
  | PNG de 49 KB em outra rota (`media/maintenance`) | 413 |

### R5 — estado e resultado de job coerentes

- **Causa:** o `returnvalue` vinha do objeto carregado **antes** de ler o estado.
- **Mudança:** `jobStatus` (`apps/api/src/jobs.ts`) lê o estado e, se for `completed`, recarrega o job antes de devolver o resultado. O BullMQ grava resultado e estado no mesmo passo atômico. Se o job foi removido entre as leituras, responde "não encontrado" em vez de `completed` sem resultado. `StoresService.job` usa essa função.
- **Teste determinístico:**
  - Uma fila falsa conclui o job exatamente entre a primeira leitura e a leitura do estado. A asserção sobre o resultado foi mantida.
  - Também cobre: remoção entre leituras, estado não concluído e dono diferente.
  - O teste de integração anterior (worker real, `result.tenantId`) continua no mesmo arquivo.

### R6 — verificador alinhado ao contrato 0/1/2

- **Mudança — registro de requisitos:** `scripts/external-evidence.mjs` lista as evidências externas obrigatórias por fase:

  | Desde a fase | Requisito | Decisão |
  |---|---|---|
  | 3 | Mercado Pago | D02 |
  | 4 | Domínio e HTTPS | D03 |
  | 4 | E-mail | D05 |
  | 4 | Backup externo | D04 |
  | 4 | Operação | D06 |
  | 5 | Piloto | D01/D08/D10 |
  | 6 | Comercial | D03/D07/D09 |
  | 7 | IA | D11 |

- **Validação do documento real:**
  - JSON não vazio;
  - `mode: "REAL"`;
  - `requirement` correspondente;
  - ambiente permitido;
  - data válida e não futura;
  - `responsible`, `procedure` e `reference` preenchidos;
  - `commit` com SHA completo e ancestral do HEAD verificado;
  - nenhum segredo ou dado pessoal;
  - `result` igual a APROVADO;
  - verificações específicas com OK.
- **Resultado por situação:**
  - Ausente ou inválido → código 2.
  - REPROVADO → código 1.
  - Fases 1–2 não têm dependência externa.
- **Modo simulado:**
  - `--externos-simulados` aceita substitutos com `mode: "SIMULADO"` e grava em arquivo separado (`verification.simulado.json`).
  - Itens sem substituto (OPERACAO/D06) continuam pendentes.
  - Um arquivo real inválido não é "salvo" pelo simulado.
- **Outras mudanças no verificador:**
  - Registra `commit` e `worktreeClean`.
  - Passa a rodar o teste do contrato.
  - **Antes de `down --volumes`**, recusa (código 2) um projeto com contêineres de outro diretório.
- **Correção encontrada no caminho:** a checagem de dado pessoal do piloto simulado tinha a regex corrompida (`d{11}` no lugar de `\d{11}`). Ela foi substituída pela validação comum.
- **Teste do contrato (10 casos):** arquivo vazio, `{}`, `[]` e JSON truncado; simulado no lugar do real; requisito, ambiente ou data incompatíveis; responsável, procedimento ou referência ausentes; commit ausente ou fora do histórico; verificação específica faltando; segredo ou e-mail; REPROVADO como falha; avaliação por fase nos dois modos.

## Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm run typecheck` | sem erros |
| `node --test tests/external-evidence.test.mjs` | 10/10 |
| `node scripts/staging.mjs up` e depois `node scripts/staging.mjs edge` | R2, R3 (configuração de produção e roteamento) e R4 aprovados; evidência em `evidencias/revisao-0179f4/borda.json` |
| `node scripts/staging.mjs check` | 7/7 etapas, incluindo domínio próprio e hostname recusado |
| `node scripts/verify.mjs --phase=7` | **código 2**: todas as etapas técnicas aprovadas, pendentes as 8 evidências externas (ver abaixo) |
| `node scripts/verify.mjs --phase=3` | **código 2**: 14/14 etapas técnicas aprovadas, pendente MERCADO_PAGO (D02); antes era 0 |
| `node scripts/verify.mjs --phase=7 --externos-simulados` | **código 2**: 17/17 etapas aprovadas, 7 substitutos SIMULADO aceitos, OPERACAO (D06) pendente por não ter substituto; 8 pendências reais mantidas |

**Etapas técnicas da fase 7:**

| Etapa | Testes |
|---|---|
| Contrato de evidências | 10 |
| Núcleo transacional, operação, observação, comercial e IA | 57 |
| Worker real e interfaces | 8 |
| Vitrine e Playwright | 12 |
| Fundação | 14 |
| Pós-backup | 1 |
| Conferências após restauração | 4 |

Também passaram: logs sanitizados, persistência S3, CLI do operador, backup, restauração e PITR.

**Falha encontrada e corrigida durante a verificação:** a primeira execução da fase 7 terminou em código 1. O teste de interface comercial esperava o desafio de MFA na própria página do painel, e a primeira versão da correção de R1 só mostrava um aviso. O `MfaGate` corrigiu isso, e a repetição aprovou.

**Isolamento:** antes de recriar volumes, conferi os projetos com `docker compose ls -a` e `docker ps --filter label=com.docker.compose.project=...`.
- Todos os projetos `ecommerce-*` desta máquina vêm deste checkout e guardam somente dados sintéticos.
- O projeto da revisão, `ecommerce-review-0179f4`, não existe aqui.
- A verificação recriou apenas `ecommerce-phase{3,7}-test`.
- O staging (`ecommerce-staging`) não teve volumes removidos.
- A proteção nova do verificador impede repetir essa remoção sobre projetos de outro diretório.

## Execuções finais

As três execuções do verificador usaram a mesma árvore (`sourceDigest` `8397f9e6…`):

| Execução | Código | Detalhe |
|---|---|---|
| Fase 7, modo padrão | 2 | Todas as 17 etapas técnicas aprovadas. Pendências: MERCADO_PAGO, DOMINIO_HTTPS, EMAIL, BACKUP_EXTERNO, OPERACAO, PILOTO, COMERCIAL, IA |
| Fase 3, modo padrão | 2 | Só pendente MERCADO_PAGO. Antes da correção, o mesmo comando retornava 0 |
| Fase 7, modo simulado | 2 | Resultado em arquivo separado (`verification.simulado.json`). Pendente OPERACAO, sem substituto simulado |

A execução simulada anterior a esta revisão, que dava código 0, foi substituída por esse resultado.

O arquivo `verification.json` das Fases 1, 2, 4, 5 e 6 é anterior à revisão. As regressões dessas fases rodaram dentro da Fase 7, que inclui todas as suítes anteriores. Pelo contrato novo, as Fases 4–6 também retornariam 2.

## Integração real e identidade: o que ainda falta, precisamente

Credenciais e testes simulados **não** concluem estas entregas.

### Pagamentos (D02)

1. `apps/api/src/purchase.ts:21,34,39,51` (`confirm`, `retry`, `connect`, `simulate`) começam com `requireSimulation()`. `methods()` (`:37`) devolve `real_enabled:false` e `oauth_enabled:false`.
2. `packages/purchase/src/index.ts:9-10` só habilita a simulação em development/test. Os pontos que fixam o provedor simulado são:
   - checkout (`:37`): `provider='SIMULATED'`;
   - emissão (`:57`): `requireSimulation()`;
   - webhook (`:119`): `requireSimulation()`;
   - webhook (`:126`): `provider='SIMULATED'`.
3. `packages/purchase/src/mercado-pago.ts`: `MercadoPagoCandidate` e `OAuthCandidate` existem como contrato, mas **não há `Transport` de produção** nem uso em nenhum ponto de `apps/`.
4. `apps/worker/src/main.ts:51`: o ciclo financeiro só roda com `simulationEnabled()`.
5. Faltam o fluxo OAuth do vendedor (URL de retorno, troca e renovação de token, armazenamento cifrado), a validação de assinatura do webhook real com consulta ativa à API do gateway, e a conciliação contra o gateway.
6. Homologação externa necessária:
   - comprador de teste (`MP_TEST_BUYER_EMAIL`);
   - client ID/secret OAuth e uma segunda conta vendedora;
   - webhook em HTTPS público;
   - evidência `evidencias/fase-0/homologacao-mercado-pago.json` no formato validado pelo verificador.

### Identidade e onboarding

1. `apps/api/src/access.ts:15` (cadastro) e `:50` (recuperação) recusam fora da caixa de correio local.
2. `apps/api/src/stores.ts:33` (abertura de loja) e `:66` (convites) recusam pelo mesmo motivo.
3. O `SmtpMailer` existente entrega só notificações de pedido. Ainda é preciso ligar o envio de verificação de e-mail, recuperação e convite a um provedor real (D05), e definir o cadastro assistido do lojista.
4. Homologação externa necessária: provedor com remetente verificado e SPF/DKIM, registrada em `evidencias/fase-4/homologacao-email.json`.

### Demais pendências externas

Do verificador, as mesmas desde 0179f4:

| Item | Decisão |
|---|---|
| Domínio, DNS e certificado públicos | D03 |
| Backup externo em outra região | D04 |
| VM, monitoramento e plantão | D06 |
| Autorização e observação do piloto | D01/D08/D10 |
| Decisões comerciais | D07/D09 |
| IA | D11 |

## Próximo passo para concluir o piloto

1. **Responsável:** fornecer o comprador de teste e as credenciais OAuth do Mercado Pago, e expor um HTTPS público para o webhook. As credenciais enviadas antes pelo chat precisam ser rotacionadas.
2. **Desenvolvimento:** implementar o `Transport` de produção e conectar `MercadoPagoCandidate`/`OAuthCandidate` aos pontos listados acima, atrás de configuração explícita e mantendo a simulação para teste. Depois, homologar no sandbox e registrar a evidência REAL.
3. **Responsável e operação:** escolher o provedor de e-mail, o domínio e a VM. **Desenvolvimento:** ligar os fluxos de identidade ao provedor e registrar as evidências D03/D04/D05/D06.
4. **Responsável:** autorizar a ativação. Em seguida, repetir `node scripts/verify.mjs --phase=4`, que só chega a 0 com essas evidências reais.
