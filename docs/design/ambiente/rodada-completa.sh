#!/usr/bin/env bash
# Rodada completa da revisão visual, do zero, só com scripts versionados (ver README.md desta pasta).
# Uso: bash docs/design/ambiente/rodada-completa.sh [pasta-de-fotos]   (logs em .local/rodada-*.log)
# APAGA e recria o projeto Compose ecommerce-design-demo e docs/design/evidencias/depois/.
# Saída: 0 só se todas as etapas passarem; 1 se alguma falhar (as etapas de verificação seguintes ainda rodam e o
# resumo final lista as que falharam). Preparação (limpar, subir, dados) que falha interrompe na hora.
set -o pipefail
cd "$(dirname "$0")/../../.." || exit 1
L=.local; mkdir -p "$L"
R="R01-lojas,R02-produtos,R02-produto-editar,R03-pedidos,R03-pedido-excedente,R04-protocolo,R05-operacao,R06-plataforma,R07-preview,R08-vitrine-a,R10-produto-foto,R12-dados,R12-revisao,R13-pendente,R14-atendimento"
falhas=()
t(){ echo "== $(date +%H:%M:%S) $*"; }
# etapa <nome> <log|-> <comando...>: roda, registra o código de saída e guarda o nome se falhar.
etapa(){ local nome=$1 log=$2; shift 2; t "$nome"
  if [ "$log" = - ]; then "$@"; else "$@" >> "$log" 2>&1; fi
  local c=$?; [ $c -eq 0 ] || { echo "   FALHOU: $nome (código $c)"; falhas+=("$nome"); }; return $c; }
preparo(){ etapa "$@" || { [ "$2" != - ] && tail -5 "$2"; echo "Rodada interrompida na preparação: $1"; exit 1; }; }

rm -f $L/rodada-*.log
preparo limpar - node docs/design/ambiente/ambiente.mjs limpar
preparo subir $L/rodada-subir.log node docs/design/ambiente/ambiente.mjs subir
preparo dados - node docs/design/ambiente/ambiente.mjs dados ${1:+--fotos=$1}
rm -rf docs/design/evidencias/depois; mkdir -p docs/design/evidencias/depois
etapa capturas $L/rodada-capturas.log node docs/design/capturar-rotas.mjs depois
etapa 320 $L/rodada-capturas.log node docs/design/capturar-rotas.mjs depois --widths=320 --only=$R
etapa 1024 $L/rodada-capturas.log node docs/design/capturar-rotas.mjs depois --widths=1024 --only=R02-produtos,R03-pedidos,R12-revisao
etapa zoom $L/rodada-capturas.log node docs/design/capturar-rotas.mjs depois --widths=1280 --zoom=2 --only=$R
etapa texto $L/rodada-capturas.log node docs/design/capturar-rotas.mjs depois --widths=1280 --texto=200 --only=$R
etapa teclado $L/rodada-teclado.log node docs/design/verificar-teclado.mjs
echo "   teclado: $(grep -c '^ok' $L/rodada-teclado.log) ok, $(grep -c '^FALHA' $L/rodada-teclado.log) falhas"; grep '^FALHA' $L/rodada-teclado.log
etapa pendente - node docs/design/ambiente/ambiente.mjs dados --so-pendente
etapa aceite $L/rodada-aceite.log node docs/design/verificar-aceite.mjs
echo "   aceite: $(grep -c '^ok' $L/rodada-aceite.log) ok, $(grep -c '^FALHA' $L/rodada-aceite.log) falhas"; grep '^FALHA' $L/rodada-aceite.log
t fim
if [ ${#falhas[@]} -gt 0 ]; then echo "RODADA REPROVADA — etapas com falha: ${falhas[*]}"; exit 1; fi
echo "Rodada aprovada: todas as etapas passaram."; exit 0
