# Preparação externa — faça quando a fase precisar

Tudo começa pendente. A conta ser criada não prova que a integração funciona. Não cole senhas/tokens em chat ou documentos; o agente deve orientar configuração segura no ambiente.

| Quando | Preparação | Responsável/participação |
|---|---|---|
| Fase 0 | Conta de desenvolvedor e aplicação Mercado Pago, vendedores/comprador de teste conforme o fluxo suportado, permissões, URLs OAuth e webhook estável | Titular da conta autoriza; agente pode preparar e auxiliar configuração |
| Fase 0 | Endereço HTTPS acessível pelo gateway; túnel persistente se necessário | Operação autoriza exposição; agente configura somente rotas necessárias |
| Fase 1 | Máquina de desenvolvimento, Node suportado e ambiente Docker/PostgreSQL executável | Responsável disponibiliza; agente verifica e documenta |
| Antes da Fase 4 ser homologada externamente | Storage S3, destino externo de backup, chaves recuperáveis e provedor de e-mail | Responsável escolhe orçamento/região; agente integra e testa |
| Antes do piloto real | Domínio da plataforma, DNS, VM/energia/internet, monitoramento e pessoa para incidentes | Responsável + operação |
| Antes do piloto real | Duas ou três lojas interessadas, segmento, dados/políticas dos fornecedores e emissão fiscal externa viável | Responsável + lojistas |
| Antes do piloto real | Termos, retenção, privacidade e procedimento de atendimento da seção 22.5 | Responsável com suporte pertinente |
| Fase 5 | Autorização de ativação e acesso às observações reais, sem necessidade de divulgar dados pessoais no relatório | Responsável + lojistas |
| Fase 6 | Preço, plano, política de suporte/cancelamento, provedor de recorrência e tratamento fiscal da receita SaaS | Responsável + financeiro/contabilidade |
| Fase 6 | Domínio próprio, Cloudflare for SaaS/alternativa homologada e agregador de frete escolhido | Responsável + operação |
| Fase 7 opcional | Demanda de descrições com IA, provedor/modelo, teto de gasto e autorização para uso | Responsável + desenvolvimento |

Domínio de cliente e Cloudflare for SaaS não são exigidos para começar a fundação. Não contratar vários serviços antes de conhecer a necessidade real de cada fase. Recursos locais equivalentes podem apoiar desenvolvimento, identificados como locais; não substituem testes externos antes de dados reais.

Ao concluir uma preparação, registrar em docs/execucao/fase-N.md: decisão correspondente D01–D11, quem disponibilizou, ambiente, evidência e o que ainda falta homologar. Nunca registrar o valor de um segredo.
