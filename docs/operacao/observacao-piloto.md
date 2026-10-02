# Instrumentos de observação do piloto (Fase 5)

Objetivo: medir uso real sem expor dados pessoais e sem confundir ausência de reclamação com sucesso.

## Coleta automática (por loja)
`node scripts/ops.mjs pilot-report --from=AAAA-MM-DD --to=AAAA-MM-DD` gera, por loja:
- publicação, ciclo de vida e pausa de vendas;
- pedidos criados/pagos/concluídos/cancelados e valor pago (GMV);
- falhas de checkout por motivo (`checkout_failures`: preço/frete mudou, sem estoque, vendas fechadas, conta de pagamento, conflito de chave, entrada inválida, serviço indisponível) e taxa de sucesso;
- incidentes abertos/resolvidos e mediana de resolução;
- devoluções confirmadas (quantidade e valor);
- protocolos, atrasados, mediana da 1ª resposta e da resolução, minutos de suporte por categoria;
- e-mails enviados/falhos/pendentes; bytes de mídia.

Nenhum campo traz nome, e-mail, endereço, mensagem ou carrinho. Amostra < 20 pedidos é marcada “inconclusiva”.

## Coleta manual
- Tempo de suporte: `node scripts/ops.mjs support-time <tenant> <min> <ONBOARDING|CATALOGUE|PAYMENT|SHIPPING|REFUND|CONSUMER|BUG|OTHER> "<nota>"` (nota recusa e-mail e números longos).
- Recursos/custo: `node scripts/resource-snapshot.mjs` (CPU/memória por serviço, tamanho do banco, WAL) — diariamente no mesmo horário; custo de VM, S3, e-mail e domínio vem das faturas dos fornecedores.
- Relatos de lojistas: somente com autorização; registrar origem (quem informou) e data.

## Registro de evidência
Copie `docs/execucao/evidencias/fase-5/observacoes.modelo.json` para `observacoes.json` e preencha **somente com dados reais** do período observado. O verificador exige: referência da autorização, ambiente PRODUCTION, ≥ 2 lojas (identificador não sensível), período e relatórios sanitizados. Dados identificáveis ficam em local restrito, fora do Git.

## Critérios para recomendar avanço (Fase 6)
Sem falha crítica aberta (isolamento, cobrança duplicada, perda de estoque/dados); fluxo T27 real em ≥ 2 lojas; incidentes financeiros resolvidos dentro do prazo combinado; tempo de suporte por loja sustentável; T33 completo aprovado antes de ampliar.
