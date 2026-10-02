# Fase 2 — loja navegável

Execute somente a Fase 2. Leia prompts/00-prompt-mestre.md, docs/PLANO-E-VERIFICACAO.md e docs/execucao/fase-1.md. Use docs/especificacao.md v1.1, especialmente 2, 4–10, 17.3, 18, 22.5, 24.1 e 25–28. Continue a base existente sem reinicializar o projeto.

## Resultado esperado

Duas lojas independentes conseguem cadastrar produtos, publicar uma vitrine real, pesquisar, adicionar variações ao carrinho e obter frete por retirada/tabela. O carrinho ainda não cobra nem reserva estoque.

## Escopo

1. Entregue catálogo com produtos, variação padrão para produto simples, atributos, categorias, SKU, preço inteiro e arquivamento. Todo caminho de compra usa variant_id. Migrations preservam tenant e referências compostas.
2. Crie saldo de estoque por variação/local e ajustes auditados, mantendo inventory_items como fonte única. Não copiar saldo para product_variants. Reservas completas entram na Fase 3.
3. Implemente upload privado, validação de conteúdo/dimensões, processamento Sharp/WebP, referências de mídia e limpeza de temporários. Aplique a política de cota do piloto: tamanho/concorrência limitados, contabilização real e tolerância controlada; não construir reserva atômica comercial agora.
4. Entregue um tema configurável com rascunho, publicação atômica, schema_version, preview autorizado, páginas e menus. Os componentes devem atender uso móvel e teclado. Não permitir execução de código do lojista.
5. Implemente perfil do fornecedor e exibição pública exigida pela seção 22.5. Em desenvolvimento, usar lojas sintéticas identificadas como teste; não inventar identidade real. Publicação real dependerá dos dados e políticas do lojista.
6. Inclua título, descrição, canonical, sitemap/robots por loja e dados estruturados coerentes. Preview, painel e recursos privados ficam fora da indexação. Nunca usar robots como controle de acesso.
7. Implemente busca em português e por SKU, somente de itens ativos da loja. Valide acentos e isolamento de consultas/cache.
8. Implemente carrinho visitante, motor de preço canônico, recálculo no servidor, quantidades válidas e frete por retirada/tabela de CEP. Cotação tem identidade, validade e correlação com endereço/itens. Erro de frete não equivale a grátis.

Não habilitar pagamento real, cobrança SaaS, domínio de cliente, IA, cupons ou frete externo. A vitrine deve ser navegável de verdade; não exibir botão que simule pedido pago. Interface de checkout pode indicar claramente que compra ainda não está habilitada nesta etapa.

## Verificação e entregáveis

Atualize e execute: node scripts/verify.mjs --phase=2.

Verifique T22, T23 e T37, FKs de catálogo e regressões T01/T02. O T03 completo de order_items fica para a Fase 3. Valide cenários de produto simples/com variações, upload inválido, concorrência de uploads limitada, publicação que falha preservando a anterior, carrinho com preço alterado e CEP não atendido.

Faça verificação visual em viewport móvel e desktop. Registre páginas e resultado no relatório; não exigir pixel perfeito por screenshot se não houver referência visual. Adicione instrução de demonstração com duas lojas sintéticas, seed seguro para ambiente de teste e docs/execucao/fase-2.md.

## Ponto de parada

Pare com as duas lojas navegáveis, dados persistidos e verificações concluídas. Registre dependências externas de storage/email sem fingir homologação. Não iniciar a Fase 3 ou ativar checkout apenas porque o catálogo está pronto.
