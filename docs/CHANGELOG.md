# Histórico — versão 1.1

Data: 30/09/2026. A versão 1.0 original foi preservada fora deste pacote; docs/especificacao.md é a referência ativa aqui.

| Ajuste | Seções principais | Consequência na execução |
|---|---|---|
| Reembolsos pelo painel do gateway no piloto | 2, 5, 12–14, 18–19, 25–26 | Iniciação pela plataforma/T18 entram na Fase 6; T35 cobre leitura e resolução manual |
| Incidentes raros com responsável e conciliação | 12–15, 24–25 | Detecção e invariantes permanecem; operador não pode fabricar estorno |
| Cota de mídia com tolerância limitada | 7, 16, 18, 25 | T23 cobre piloto; T38 valida reserva rigorosa no comercial |
| Restauração/conciliação manual permitida | 21, 25 | T26 exige ensaio e evidência, sem exigir automatização completa |
| Atendimento ao consumidor | 8, 18–19, 22.5, 25 | Perfil público, protocolo/atendimento e T36 antes do piloto |
| SEO explícito | 8.1, 17, 25 | T37 no piloto e na ativação de domínio próprio |
| PostgreSQL suportado sem obrigação de versão 18 | 3.1 | Decisão de versão/UUIDv7 registrada na Fase 1 |
| Tunnel como opção de acesso à origem | 17.4 | Não substitui autenticação ou ciclo do domínio do cliente |
| Execução por oito prompts | 26–28 e pasta prompts/ | Fase 0 independente; relatório, verificação e parada por fase |

O modelo de dados, as tabelas de permissões, estados, contratos e testes foram ajustados junto das regras; não se trata apenas de acrescentar uma observação no final da versão anterior.

A INV-07 também foi esclarecida: o limite para um novo estorno considera valores já devolvidos e solicitações em aberto; não se compara incorretamente a soma das devoluções com um saldo que já as descontou.

Não houve implementação, cadastro de contas, pagamento, publicação ou homologação do SaaS nesta consolidação.
