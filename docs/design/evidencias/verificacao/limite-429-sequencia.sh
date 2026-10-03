#!/bin/bash
# uso: sequencia.sh <rótulo> <dir worktree> <projeto> <args compose extras...> — reproduz as etapas 'worker parado' + 'worker real' do verify.mjs
L=$1; W=$2; P=$3; shift 3; S=/tmp/claude-0/-home-user-ecommerce/0f0133cd-4597-5ef4-894f-6a335bbc9956/scratchpad
cd $W; C="docker compose -p $P --env-file .local/test.env -f compose.yaml -f compose.test.yaml $*"
$C down --volumes --remove-orphans >/dev/null 2>&1; $C up -d --wait --wait-timeout 200 web worker >/dev/null 2>&1; sleep 65
a=$(docker logs $P-api-1 2>&1 | grep -c '"statusCode":429')
$C stop worker >/dev/null 2>&1
$C run --rm --no-deps tests node --test --test-concurrency=1 tests/purchase.test.mjs tests/operations.test.mjs tests/pilot-observation.test.mjs tests/commercial.test.mjs tests/ai.test.mjs > $S/seq-$L-api.log 2>&1
$C up -d --wait --wait-timeout 90 worker >/dev/null 2>&1
$C run --rm --no-deps tests node --test --test-concurrency=1 tests/purchase-worker.test.mjs tests/pilot-flow.test.mjs tests/commercial-ui.test.mjs > $S/seq-$L-ui.log 2>&1
b=$(docker logs $P-api-1 2>&1 | grep -c '"statusCode":429')
echo "$L: API $(grep -E '^ℹ (pass|fail)' $S/seq-$L-api.log | tr '\n' ' ') | UI $(grep -E '^ℹ (pass|fail)' $S/seq-$L-ui.log | tr '\n' ' ') | respostas 429 novas: $((b-a))"
