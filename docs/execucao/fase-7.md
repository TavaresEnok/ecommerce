# Fase 7 — evolução opcional: descrição de produto com IA

- **Especificação:** v1.1; prompt `prompts/fase-7-evolucao-controlada.md`.
- **Estado:** **PENDENTE_EXTERNA** — recurso implementado e verificado com provedor SIMULADO; falta homologar o provedor real (chave da API, orçamento aprovado em D11 e uma chamada paga controlada).
- **Demanda:** priorizada pelo responsável nesta sessão (seguir as fases até o fim); **demanda de lojistas não medida** — sem piloto real.
- **Liberação:** NÃO_SOLICITADA. Desligado por padrão na plataforma e em cada loja; nenhuma chamada paga foi feita.
- **Data:** 02/10/2026.

## Entregue
- Serviço transversal `packages/purchase/src/ai.ts` com contrato `AiProvider`, adaptador Anthropic (SDK oficial, `claude-opus-5-5`, esforço `low`, fallback em recusa, sem retentativa automática) e simulador de teste.
- Migration `0010_ai.sql`: política global versionada (preço de referência, limites de entrada/saída, tetos mensais e concorrência), uso global e por loja, configuração por loja e gerações com modelo, versão da política, tokens, custo reservado/confirmado e motivo de parada.
- Reserva do pior caso sob locks antes da chamada; conciliação depois; UNKNOWN retém a reserva até a expiração controlada de 24 h (worker).
- API (`apps/api/src/ai.ts`) e administração da política (`/platform/ai/policy`, MFA e auditoria). Interface: seção “Descrição com IA” no painel de Operação (gerar, comparar com a descrição atual, editar, salvar ou descartar).
- Decisão: [`docs/decisoes/ia.md`](../decisoes/ia.md). Contrato: [`docs/api/ia.openapi.yaml`](../api/ia.openapi.yaml).

## Verificações
| Execução | Resultado |
|---|---|
| `tests/ai.test.mjs` (iterações locais) | Corrigido: comparação da versão do produto passou para o SQL (o `Date` do JS perde microssegundos e acusaria conflito sempre); teste ajustado porque texto editado com HTML é recusado (400), como no cadastro manual |
| `node scripts/verify.mjs --phase=7` (14:42–14:50 UTC, fontes `1edfacb0…3ab6`) | **Código 2 — PENDENTE_EXTERNA**. 16/16 etapas técnicas aprovadas: núcleo+operação+instrumentos+comercial+IA 57/57, worker/UI/T27 8/8, Fase 2 12/12, fundação 13/13, pós-backup, pós-restore 4/4, logs, S3, CLI, PITR. Pendências externas: observação real do piloto, decisões comerciais/provedores e homologação da IA real |

Cobertura (SIMULADA): desligado por padrão e sem provedor (geração recusada; cadastro manual e compra seguem); autorização (Dono liga, Funcionário gera, outra loja e visitante não leem); reserva/conciliação/idempotência; salvamento explícito sem publicar; edição concorrente; sanitização e instrução no conteúdo tratada como dado; **T34** — concorrência na mesma loja (1 de 3), orçamento da loja nunca ultrapassado, timeout com reserva retida até expiração de 24 h, saída excessiva limitada por `max_tokens`, falha do provedor sem custo; teto global entre lojas; desligamento global. Evidências: [`verification.json`](evidencias/fase-7/verification.json), [`ai.json`](evidencias/fase-7/ai.json).

## Pendências
| Pendência | Responsável |
|---|---|
| D11: provedor/modelo confirmados, orçamento mensal e autorização de gasto | Responsável |
| `ANTHROPIC_API_KEY` no cofre do ambiente e uma geração real registrada em `evidencias/fase-7/homologacao-ia.json` (modelo, tokens, custo, data — sem conteúdo de produto real) | Desenvolvimento + responsável |
| Medir demanda e qualidade no piloto antes de liberar para todas as lojas | Responsável + lojistas |

## Substitutos simulados (02/10/2026)

As dependências externas desta fase foram exercitadas com substitutos locais fictícios. Veja [substitutos-simulados.md](substitutos-simulados.md). Isso **não** encerra as pendências reais listadas acima.
