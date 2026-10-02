# Fase 5 — observar e ajustar o piloto real

- **Especificação:** v1.1; execução limitada a `prompts/fase-5-validacao-piloto.md`.
- **Estado:** **PENDENTE_EXTERNA** — não há autorização de ativação, lojas convidadas nem uso real. Instrumentos, onboarding e T33 preparados/executados localmente.
- **Liberação operacional:** **NÃO_SOLICITADA**. Ninguém foi convidado, nenhuma mensagem enviada, nenhuma compra real.
- **Data:** 01–02/10/2026. Decisão do responsável nesta sessão: adiar a homologação do Mercado Pago (Fase 0) e seguir com o trabalho possível da fase.

## 1. Critérios de entrada (Fase 4 → piloto)

Os critérios da seção 26.1 **não** estão atendidos (ver `fase-4.md` §5): gateway real não homologado, MFA, e-mail, domínio/HTTPS, backup externo, VM/monitoramento, termos, lojas piloto e autorização. Portanto **não há lojas participantes, período observado nem volume efetivo** a relatar. Nenhum indicador abaixo é observação de uso real.

## 2. Entregue

1. **Roteiro de onboarding** com passos que exigem o lojista: [`docs/operacao/onboarding-lojista.md`](../operacao/onboarding-lojista.md).
2. **Instrumentação por loja sem dados pessoais** (migration `0008_pilot_observation.sql`):
   - falhas de checkout registradas por motivo/status (`checkout_failures`), fora da transação que falhou;
   - relatório `node scripts/ops.mjs pilot-report` (pedidos, GMV pago, taxa de sucesso do checkout, incidentes e mediana de resolução, devoluções, protocolos, 1ª resposta/resolução, minutos de suporte, e-mails, mídia, aviso de amostra pequena);
   - registro de esforço `ops.mjs support-time` (recusa notas com e-mail/números longos);
   - custo/recursos `node scripts/resource-snapshot.mjs`.
   Guia: [`docs/operacao/observacao-piloto.md`](../operacao/observacao-piloto.md); modelo de evidência real: [`evidencias/fase-5/observacoes.modelo.json`](evidencias/fase-5/observacoes.modelo.json).
3. **T33 — ensaio de capacidade** (`scripts/capacity.mjs` + `tests/capacity.mjs`): projeto Docker próprio, 10 lojas × 100 produtos × ~5 variações (4 930 variações), carga em malha aberta, 95% leituras/5% escritas de compra, fase fria após reinício da API, 20 req/s sustentado e pico de 40 req/s, disputa de 20 compradores pela última unidade, gateway SIMULADO com 300 ms de latência e 2% de erro, amostragem de recursos a cada minuto e conferência de invariantes.
4. **Correção encontrada:** a migration podia falhar com `ECONNREFUSED` quando o healthcheck do PostgreSQL passava pelo socket de inicialização antes do TCP; `scripts/migrate.mjs` agora repete só a conexão (até 30 s).
5. Ajustes de infraestrutura para o ensaio: limite por IP configurável (`RATE_LIMIT_PER_MINUTE`, padrão inalterado), latência/erro do gateway simulado configuráveis (somente onde a simulação é permitida).
6. Verificador `node scripts/verify.mjs --phase=5`: repete as regressões das Fases 1–4, testa os instrumentos e exige T33 completo + observações reais; sem elas retorna **2**.

## 3. Verificações

### Verificador

| Comando | Resultado |
|---|---|
| `node scripts/verify.mjs --phase=5` (1ª) | Código 2 técnico: captura dos logs excedeu o buffer de 1 MB do `spawnSync` (corrigido em `scripts/compose.mjs`, 256 MB) |
| `node scripts/verify.mjs --phase=5` (final, 01:10–01:17 UTC, fontes `b5c8f769…a2ec`) | **Código 2 — PENDENTE_EXTERNA**: as 16 etapas técnicas passaram (núcleo+operação+instrumentos 36/36, worker/UI/T27 7/7, Fase 2 12/12, fundação 13/13, pós-restore 4/4, logs, S3, CLI, backup, PITR) e o T33 completo foi aceito; falta somente a observação real (`observacoes.json`) |

Evidências: [`verification.json`](evidencias/fase-5/verification.json), [`pilot-observation.json`](evidencias/fase-5/pilot-observation.json), [`capacidade.json`](evidencias/fase-5/capacidade.json), [`capacidade-reduzida.json`](evidencias/fase-5/capacidade-reduzida.json).

### T33 — capacidade (dados sintéticos, gateway SIMULADO)

Ambiente: Docker Desktop no Windows com ~4 GB para o Docker; limites por serviço do `compose.yaml` (api/web/worker/postgres: 1 CPU e 768 MB cada); cliente de carga na mesma máquina. **Não é equivalente à VM alvo (8c/16 GB)** e não comprova capacidade comercial.

| Execução | Requisições / pedidos | Leitura pública p95 (quente) | Checkout local p95 | Falhas internas | Invariantes / última unidade | Emissão pelo gateway (externa, à parte) |
|---|---|---|---|---|---|---|
| Reduzida (1+3+1 min) | 7 406 / 104 | 245 ms (frio: até 1 061 ms) | 143 ms | 0% | 0 violações / 1 de 20 | — |
| Completa nº 1 (1+30+5 min) | 50 968 / 885 | 177 ms (frio: 831 ms busca) | 100 ms | 0% | 0 / 1 de 20 | **mediana 11,6 s; p95 172 s; máx. 455 s** |
| Completa nº 2, após correção | 50 838 / 820 | **145 ms** (frio: 230 ms) | **83 ms** | **0%** | **0 / 1 de 20** | **mediana 1,8 s; p95 4,0 s; máx. 36 s** |

**Falha encontrada e corrigida pelo T33:** o worker consultava as tentativas uma a uma e reconsultava todas as pendentes a cada 2 min. Com centenas de Pix pendentes e 300 ms de latência do provedor, as emissões novas ficavam minutos na fila (os pagamentos ficariam sem QR code). Correção: emissões novas primeiro, até 8 consultas concorrentes fora de transação, reconsulta progressiva (2 min nos primeiros 30 min, depois 10 min, depois 1 h — seção 14.4) e nova tentativa em 30 s após erro do provedor. A 1ª execução está preservada em [`capacidade-antes-da-correcao.json`](evidencias/fase-5/capacidade-antes-da-correcao.json); a vigente em [`capacidade.json`](evidencias/fase-5/capacidade.json).

Observações: PostgreSQL usou 7–63% de 1 CPU e ~210 MB; API ~130 MB; nenhuma requisição descartada pelo gerador. **WAL arquivado cresceu ~587 MB em 40 min de carga** (segmentos de 16 MB forçados por `archive_timeout=60` sem compressão): retenção/compressão precisam ser definidas com a ferramenta de backup (D04) antes de produção. Pagamentos não foram aprovados durante a carga (baixa sob aprovação é coberta por T14/T16/T27).

## 4. Procedimento manual de reembolso/atendimento

Executor: Dono da loja no painel do Mercado Pago; operador da plataforma acompanha alertas `FINANCIAL_*`. Sem uso real não há medida de atraso; o relatório de piloto passa a medir mediana de resolução de incidentes e de protocolos. Risco aberto: o procedimento depende de o Dono agir no mesmo dia (comunicação imediata, seção 22.5); sem canal de alerta externo (D05/D06) o operador precisa consultar diariamente.

## 5. Recomendação

**Continuar preparação; não iniciar observação nem Fase 6.** Motivos: (1) gateway real e demais itens da 26.1 pendentes; (2) nenhuma loja ativada; (3) custos reais desconhecidos. Próximo passo mínimo: credenciais de teste do Mercado Pago (Fase 0) e decisões D03/D04/D05/D06/D08; depois autorização de ativação para 2–3 lojas e coleta com os instrumentos acima.

## Substitutos simulados (02/10/2026)

As dependências externas desta fase foram exercitadas com substitutos locais fictícios. Veja [substitutos-simulados.md](substitutos-simulados.md). Isso **não** encerra as pendências reais listadas acima.
