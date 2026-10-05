# Evidências — rodada Compasso (sobre o commit 9bcc3f2, 04/10/2026)

Capturas reais do projeto de desenvolvimento (http://localhost:3000), com as mesmas lojas de exemplo
(`scripts/fixtures/seed-presets.mjs`), a mesma conta Dono (Barro & Trama) e o mesmo produto em foco
(`CAPTURE_PRODUCT=bule-de-porcelana-verde`) antes e depois. Só a área visível da tela (sem rolar), convertida para JPEG.
As capturas completas (página inteira, 94 por rodada) ficam em `artifacts/capturas/` (fora do Git).

| Pasta | Conteúdo | Origem |
|---|---|---|
| `antes/` | 15 telas × 1440×900 e 390×844, antes da rodada | `artifacts/capturas/compasso-antes` |
| `depois/` | As mesmas 15 telas + troca de modelo (`painel-aparencia-modelos`) e prévia ampliada (`painel-aparencia-ampliada`) | `artifacts/capturas/compasso-r2` |
| `limites/` | 9 telas em 768×1024 e 320×640 | `artifacts/capturas/compasso-r2-limites` |
| `zoom-real/` | Zoom **real** do navegador (200% e 400%, janela de 1280 px) em 7 telas + `zoom.json` com as medições | `scripts/zoom-check.mjs` |

Diferenças de dados entre antes e depois (não são mudança de interface): a foto de abertura do Editorial (Atelier Norte)
foi trocada por outra foto CC0; o menu do Essencial ganhou a categoria “Garrafas e mochilas”, que existia mas não
estava no menu; houve pedidos de teste a mais (números maiores na lista de pedidos).

Como comparar: abra o mesmo nome de arquivo em `antes/` e `depois/`. Medições: rolagem horizontal 0 px em todas as
94 + 24 capturas; primeiro produto do catálogo a y = 300 px em 390×844.

A aprovação visual humana desta rodada **não** aconteceu — estas imagens existem para ela.
