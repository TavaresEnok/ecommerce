# Roteiro de onboarding do lojista piloto (Fase 5)

Pré-condição: autorização de ativação registrada e itens bloqueantes da Fase 4 resolvidos (gateway homologado, e-mail, domínio/HTTPS, backup externo, MFA, termos). Sem isso, **não convidar** ninguém.

Legenda: **[L]** exige o lojista (não pode ser feito nem inventado pela plataforma) · **[O]** operador da plataforma · **[L+O]** juntos.

| # | Passo | Quem | Como verificar |
|---|---|---|---|
| 1 | Confirmar interesse, segmento e emissão fiscal externa viável (D01/D10) | [L+O] | Registro de aceite do lojista com data (fora do repositório) |
| 2 | Aceite de termos, privacidade e responsabilidades (D08) | [L] | Aceite registrado pelo próprio lojista |
| 3 | Criar conta com e-mail próprio verificado; ativar MFA | [L] | Login do lojista; MFA ativo |
| 4 | Criar a loja (nome, endereço da loja) — ativação assistida | [L+O] | Loja em DRAFT no painel |
| 5 | Perfil do fornecedor: razão social/CPF ou CNPJ, endereço, contato, políticas de troca/arrependimento, prazos e restrições | [L] | Rodapé da vitrine com dados reais (não “TESTE”) |
| 6 | Catálogo: categorias, produtos, variações, fotos (≤10 MB, ≤40 MP), saldo inicial com motivo | [L] | Vitrine mostra produtos ACTIVE; busca encontra |
| 7 | Frete: retirada e/ou faixas de CEP com preço e prazo; testar CEP não atendido | [L] | Cotação correta; CEP fora da faixa recusa |
| 8 | Conectar Mercado Pago por OAuth na conta da própria loja | [L] | Conta CONNECTED com ambiente PRODUCTION; vendedor correto |
| 9 | Tema: cores, textos, páginas; publicar | [L] | Preview e versão publicada |
| 10 | Equipe: convidar funcionário (opcional) | [L] | Convite aceito; funcionário sem acesso a gateway |
| 11 | Compra assistida de valor baixo com comprador real autorizado (T27) | [L+O] | Pedido pago na conta da loja; e-mails recebidos |
| 12 | Expedição: separar, enviar/retirar, confirmar entrega | [L] | Pedido COMPLETED |
| 13 | Atendimento: abrir protocolo de teste e responder; simular arrependimento até a comunicação ao MP | [L+O] | Protocolo concluído; procedimento compreendido |
| 14 | Devolução pelo painel do MP do pedido de teste (T35 real) | [L] | Pendência resolvida só após conciliação |
| 15 | Combinar canal de suporte, horários e quem atende incidentes | [L+O] | Registrado no relatório da Fase 5 |

Tempo de suporte gasto em cada passo: `node scripts/ops.mjs support-time <tenant> <minutos> ONBOARDING "<nota sem dados pessoais>"`.
