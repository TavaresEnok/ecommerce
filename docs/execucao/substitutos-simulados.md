# Substitutos fictícios das dependências externas (SIMULADO)

Decisão de 02/10/2026: sem HTTPS público, contas e contratos disponíveis no momento, as dependências externas foram
substituídas por equivalentes **locais e fictícios**, para exercitar o mesmo código de integração de ponta a ponta.
Tudo o que eles produzem tem `mode: "SIMULADO"` no arquivo e sufixo `.simulado.json`. **Nada aqui é homologação real.**
O resultado real de cada fase continua em `verification.json`. As pendências reais não foram apagadas.

## O que substitui o quê

| Dependência real | Substituto local | Evidência |
|---|---|---|
| Domínio público + HTTPS (Let's Encrypt) | Caddy com autoridade local (`tls internal`) + on-demand TLS consultando `/internal/tls/ask` | `fase-4/staging.simulado.json` |
| DNS público do lojista | Arquivo de zona `.local/staging/dns.json` (ignorado em produção) | idem |
| Provedor de e-mail (SMTP) | Cliente SMTP real (`SmtpMailer`) entregando ao Mailpit | idem |
| Backup externo em outra região | Segundo S3 (`offsite`), cópia cifrada AES-256-GCM com chave própria, restauração em banco limpo | `fase-4/backup-externo.simulado.json` |
| Piloto com lojas reais | Duas lojas fictícias com compradores roteirizados (pagos, recusados, abandono, preço alterado, pausa, devolução parcial) | `fase-5/observacoes.simulado.json` |
| Decisões comerciais D03/D07/D09 | Valores provisórios de demonstração (não cadastrados como ACTIVE) | `fase-6/decisoes-comerciais.simulado.json` |
| Mercado Pago sandbox completo | `SimulatedGateway` (suíte de compra) | `fase-0/gateway.simulado.json` |
| Anthropic com chave e orçamento | `SimulatedAiProvider` (suíte de IA) | `fase-7/homologacao-ia.simulado.json` |

## Como executar

```bash
node scripts/staging.mjs up
```
```bash
node scripts/staging.mjs check
```
```bash
node scripts/staging.mjs pilot
```
```bash
node scripts/offsite-drill.mjs
```
```bash
node scripts/simulated-evidence.mjs
```
```bash
node scripts/verify.mjs --phase=7 --externos-simulados
```

Staging local: https://localhost:8443 (aceitar a autoridade local do Caddy), e-mails capturados em http://localhost:8025.
Depois da revisão 0179f4 (R6), o modo simulado aceita apenas substitutos com `mode: "SIMULADO"`. Itens sem substituto (VM, monitoramento e plantão, D06) continuam pendentes, então a partir da Fase 4 o modo simulado também termina em código 2. O resultado do modo simulado vai para `verification.simulado.json`, com `externalMode: "SIMULADO"`, a lista
`simulatedExternals` e `realPending` (as pendências reais que continuam abertas).

## O que continua pendente de verdade

- Mercado Pago: conta de comprador de teste, OAuth client ID/secret com segunda conta vendedora e webhook em HTTPS público.
- Piloto: autorização de ativação, lojas reais e o período observado (T27 com cobrança real).
- D03, D07 e D09: aprovação de preços, provedor de cobrança recorrente, orientação fiscal e agregador de frete.
- IA: chave real, orçamento autorizado e uma chamada paga controlada.
- Infraestrutura de produção: VM, domínio, certificados públicos, provedor de e-mail com SPF/DKIM e backup em outra região.
- Credenciais do Mercado Pago enviadas no chat: **rotacionar**.
