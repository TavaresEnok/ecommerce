# Fase 6 — preparar a comercialização

Execute somente a Fase 6. Leia prompts/00-prompt-mestre.md, docs/PLANO-E-VERIFICACAO.md e os relatórios das Fases 0 e 5. Use docs/especificacao.md v1.1, especialmente 2, 5, 7, 10, 14–19, 20–22, 24–28.

## Resultado esperado

Um plano pago simples, cobrança do lojista, domínio próprio, frete integrado, cotas rigorosas e iniciação segura de reembolso pela plataforma. Tudo deve ser homologado para as condições efetivamente escolhidas; a liberação comercial permanece uma decisão explícita.

## Pré-requisitos

Use as decisões comerciais e o aprendizado do piloto. Se preço, recorrência, regras fiscais, fornecedor de frete ou domínios ainda não estiverem definidos, prepare contratos e trabalho independente, mas não invente oferta nem contrate serviço. Preserve operações das lojas piloto e registre pendências pelo ID D correspondente.

## Escopo

1. Implemente versões de plano, assinatura, fatura e cotas. Comece com um plano pago aprovado, sem criar automaticamente FREE/START/PRO ou “ilimitado”. Valores anteriores de exemplo não são preços autorizados.
2. Integre cobrança SaaS com a conta/provedor da plataforma, separada das contas de pagamento dos lojistas. Teste aprovação, atraso, cancelamento, alteração de plano e deduplicação. Não bloquear tratamento de pedidos anteriores por inadimplência.
3. Adicione iniciação de reembolso no backend/painel do dono. Persistir intenção antes da chamada, serializar limite de saldo e usar referência idempotente. Após timeout, consultar antes de repetir. Tratar devolução parcial externa já existente, disputa, saldo insuficiente e falha; não declarar estorno antes da confirmação.
4. Se houver decisão de plano com comissão, habilite apenas métodos homologados e complete a conciliação/reversão T30. Sem essa condição, lance a oferta sem comissão; falha de split não deve fabricar receita ou obrigar um plano gratuito inviável.
5. Substitua a tolerância de mídia por reserva atômica de cota, expirando operações abandonadas e reconciliando bytes. Faça migration segura dos contadores existentes. Downgrade não apaga dados nem impede obrigações anteriores.
6. Implemente domínio do cliente com prova de controle vinculada à loja, ativação DNS/TLS, tratamento de falhas, canonical, redirecionamento e remoção segura. Homologue Cloudflare for SaaS ou a alternativa decidida; não presumir que um CNAME já significa domínio pronto.
7. Integre um provedor de frete aprovado. Homologue cotação, embalagem, limites, credenciais, validade e erros. Compra de etiqueta só entra se explicitamente incluída; consultar frete não autoriza comprar etiqueta automaticamente.
8. Conclua administração da plataforma para plano, cobrança, cotas, incidentes e suspensão, com autorização e auditoria. Valide o processo fiscal da receita SaaS e documentos/políticas comerciais aplicáveis, usando decisões reais do responsável.

Não adicionar múltiplos gateways, múltiplos planos, marketplace de temas, campanhas ou emissão fiscal própria só por antecipação. Faça alterações compatíveis com as lojas existentes e preserve o histórico de preço, comissão e plano.

## Verificação e entregáveis

Atualize e execute: node scripts/verify.mjs --phase=6.

Cubra T18, T28–T29, T31, T33 e T38. T30 é obrigatório para comissão, não para plano sem comissão. Repita T37 para domínio próprio e as regressões críticas de tenant, checkout, estoque, recebimentos e consumidor afetadas pelas mudanças. Identifique ambiente de cada homologação; sandbox não comprova ativação comercial da conta.

Entregue migrations compatíveis, contratos, testes, evidências, plano de deploy/rollback, checklist de configuração comercial e docs/execucao/fase-6.md. Mostre o que está pronto tecnicamente e o que depende de aprovação/ativação externa.

## Ponto de parada

Pare depois de preparar/verificar a entrega comercial. Não iniciar cobrança de lojistas, alterar preços de clientes existentes, migrar produção ou publicar sem autorização aplicável. Uma autorização já concedida para uma ação específica deve ser respeitada, sem confirmação redundante. Não iniciar a Fase 7 automaticamente.
