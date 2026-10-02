---
name: testing
description: "Padrões de testes E2E com Playwright e validação dos cenários T01 a T34"
---

# Testing Standards & E2E Verification

## Princípios
1. **Compilar não é concluir:** Um recurso só está pronto após teste automatizado passar com sucesso.
2. **Cenários Obrigatórios (T01 a T34):**
   - Criação e isolamento entre Loja A e Loja B.
   - Vitrine, busca, catálogo e estoque.
   - Adição ao carrinho e cálculo de frete.
   - Checkout com idempotência (checkout repetido não cria 2 pedidos).
   - Tentativa de acesso cruzado: Comprador A não pode ver pedido do Comprador B; Funcionário de uma loja não acessa dados de outra loja.
3. **Playwright MCP:** Use o Playwright MCP para navegar na árvore de acessibilidade da vitrine e do painel, simulando o comportamento real do usuário.
