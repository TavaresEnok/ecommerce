# Conferência da interface — Fase 1

- Data/hora: **2026-10-01T03:25:36.056Z** (UTC, resultado devolvido pelo Playwright MCP).
- Ambiente: desenvolvimento local, Docker Desktop, `http://localhost:3000/`, imagem final da fundação (NestJS 12.1.2/Fastify 5.12.5, Next.js 16.3.8).
- Responsável: agente nesta sessão, usando Playwright MCP/Chromium. Não é homologação humana ou externa.
- Versão técnica vinculada: digest do runner `71fec3a2849b191127b7aaeb28e6127cb5bf4780590a8aac28ed5f12ef05fb9c`, código 0 em verification.json.
- Dados: amostras sintéticas, e-mail example.test, senha aleatória não registrada. Nenhuma mensagem externa enviada.

## Procedimento realmente executado

1. Navegar para a página inicial e inspecionar a árvore de acessibilidade.
2. Cadastrar usuário pelo formulário Criar acesso, com senha gerada aleatoriamente em memória.
3. Confirmar o código de verificação LOCAL pelo formulário Verificar e-mail (não comprova entrega externa/posse real da caixa postal).
4. Entrar pelo formulário de login e aguardar painel autenticado.
5. Criar uma loja em rascunho pelo formulário Criar loja.
6. Alterar Nome de exibição e salvar; aguardar resposta Configuração salva no banco.
7. Recarregar página, selecionar novamente a loja e comparar Nome de exibição com o valor salvo.
8. Sair e confirmar retorno ao formulário de login.

**Resultado observado: aprovado**, incluindo persistência após reload e logout. Nenhuma senha/token foi incluído neste registro.

Isolamento de duas lojas, Funcionário, escrita RLS, worker e restore foram demonstrados pela suíte automatizada do runner, não inventados a partir desta conferência visual. Referência: `verification.json`, `tests/foundation.test.mjs`, `tests/restore.test.mjs`.
