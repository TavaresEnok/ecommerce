# Procedimento — pausa de vendas e suspensão de loja

## Pausa pelo Dono
Painel → Operação → “Pausar novas vendas” (motivo obrigatório). Retomar no mesmo lugar.

## Suspensão pela plataforma (operador do host)
```sh
node scripts/ops.mjs suspend <tenant_id> "motivo objetivo"
node scripts/ops.mjs reactivate <tenant_id> "motivo"
```
Efeitos: vitrine e carrinho indisponíveis; checkout e novas tentativas de pagamento bloqueados; publicação de tema não reativa. **Continuam:** consulta do pedido pelo comprador, conciliação de pagamentos e devoluções, expedição de pedidos pagos, atendimento e contato geral. Cada ação fica em `tenant_lifecycle_events`.

Comunicar ao lojista o motivo e o comportamento esperado da vitrine. Não apagar evidências; remoção de conteúdo abusivo é separada da suspensão.

Limitação: não há console de administrador da plataforma com MFA; a CLI exige acesso ao host. Ensaio: T25 automatizado (relatório da Fase 4).
