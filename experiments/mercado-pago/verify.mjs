// Fase 0 verifier: local tests (SIMULATED gateway) + presence of external SANDBOX evidence. Never performs transactions.
// Exit 0: tests pass and required external evidence exists. 1: demonstrated failure. 2: missing prerequisite/evidence.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = import.meta.dirname, out = join(dir, 'evidence/verification.json'); mkdirSync(join(dir, 'evidence'), { recursive: true });
const summary = { phase: 0, specification: '1.1', startedAt: new Date().toISOString(), node: process.version, local: null, external: null, exitCode: 2 };
const REQUIRED = [['OAUTH_CONNECT', 2], ['CREATE_PIX', 1], ['CREATE_CARD', 1], ['WEBHOOK_SIGNED', 1], ['QUERY_BY_REFERENCE', 1], ['REFUND_READ', 1], ['ACCOUNT_REVOKED_BLOCKS_NEW', 1]];
try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw Object.assign(new Error('Node >= 24 necessário (TypeScript nativo e node:sqlite).'), { exitCode: 2 });
  const run = spawnSync(process.execPath, ['--test', '--disable-warning=ExperimentalWarning', 'test/poc.test.ts'], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  process.stdout.write(run.stdout); const pass = /ℹ pass (\d+)/.exec(run.stdout)?.[1], fail = /ℹ fail (\d+)/.exec(run.stdout)?.[1];
  summary.local = { result: run.status === 0 ? 'passed' : 'failed', pass: Number(pass), fail: Number(fail), kind: 'SIMULADO (test/fake-gateway.ts) — não é sandbox nem produção' };
  if (run.status !== 0) throw Object.assign(new Error('Testes locais falharam.'), { exitCode: 1 });
  const file = join(dir, 'evidence/external.json');
  if (!existsSync(file)) throw Object.assign(new Error('PENDENTE_EXTERNA: evidence/external.json ausente — execute a homologação manual no ambiente de TESTE do Mercado Pago (README).'), { exitCode: 2 });
  const e = JSON.parse(readFileSync(file, 'utf8')), missing = REQUIRED.filter(([cap, n]) => e.items.filter(i => i.capability === cap && i.result !== 'FAILED').length < n).map(([c]) => c);
  if (e.environment !== 'SANDBOX') throw Object.assign(new Error('Evidência externa deve ser do ambiente SANDBOX.'), { exitCode: 2 });
  if (JSON.stringify(e).match(/APP_USR-|TEST-[0-9a-f]{4}|access_token|refresh_token/)) throw Object.assign(new Error('Evidência contém credencial; remova e repita.'), { exitCode: 1 });
  summary.external = { items: e.items.length, missing };
  if (missing.length) throw Object.assign(new Error(`PENDENTE_EXTERNA: faltam evidências ${missing.join(', ')}`), { exitCode: 2 });
  summary.exitCode = 0;
} catch (error) { summary.exitCode = error.exitCode ?? 1; summary.error = error.message; console.error(error.message); }
finally { summary.finishedAt = new Date().toISOString(); writeFileSync(out, JSON.stringify(summary, null, 2) + '\n'); console.log(`Fase 0: código ${summary.exitCode}. Evidência: experiments/mercado-pago/evidence/verification.json`); process.exitCode = summary.exitCode; }
