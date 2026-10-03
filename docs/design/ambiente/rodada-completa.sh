#!/usr/bin/env bash
# Rodada completa da revisão visual, do zero, só com scripts versionados (ver README.md desta pasta).
# Uso: bash docs/design/ambiente/rodada-completa.sh [pasta-de-fotos]   (logs em .local/rodada-*.log)
# APAGA e recria o projeto Compose ecommerce-design-demo e docs/design/evidencias/depois/.
set -o pipefail
cd "$(dirname "$0")/../../.." || exit 1
L=.local; mkdir -p "$L"
R="R01-lojas,R02-produtos,R02-produto-editar,R03-pedidos,R03-pedido-excedente,R04-protocolo,R05-operacao,R06-plataforma,R07-preview,R08-vitrine-a,R10-produto-foto,R12-dados,R12-revisao,R13-pendente,R14-atendimento"
t(){ echo "== $(date +%H:%M:%S) $*"; }
t limpar; node docs/design/ambiente/ambiente.mjs limpar || exit 1
t subir; node docs/design/ambiente/ambiente.mjs subir > $L/rodada-subir.log 2>&1 || { tail -5 $L/rodada-subir.log; exit 1; }
t dados; node docs/design/ambiente/ambiente.mjs dados ${1:+--fotos=$1} || exit 1
rm -rf docs/design/evidencias/depois; mkdir -p docs/design/evidencias/depois
t capturas; node docs/design/capturar-rotas.mjs depois > $L/rodada-capturas.log 2>&1; tail -1 $L/rodada-capturas.log
t 320; node docs/design/capturar-rotas.mjs depois --widths=320 --only=$R >> $L/rodada-capturas.log 2>&1
t 1024; node docs/design/capturar-rotas.mjs depois --widths=1024 --only=R02-produtos,R03-pedidos,R12-revisao >> $L/rodada-capturas.log 2>&1
t zoom; node docs/design/capturar-rotas.mjs depois --widths=1280 --zoom=2 --only=$R >> $L/rodada-capturas.log 2>&1
t texto; node docs/design/capturar-rotas.mjs depois --widths=1280 --texto=200 --only=$R >> $L/rodada-capturas.log 2>&1
t teclado; node docs/design/verificar-teclado.mjs > $L/rodada-teclado.log 2>&1; echo "teclado exit $?"; grep -c "^ok" $L/rodada-teclado.log
t pendente; node docs/design/ambiente/ambiente.mjs dados --so-pendente
t aceite; node docs/design/verificar-aceite.mjs > $L/rodada-aceite.log 2>&1; echo "aceite exit $?"; grep -c "^ok" $L/rodada-aceite.log; grep "^FALHA" $L/rodada-aceite.log
t fim
