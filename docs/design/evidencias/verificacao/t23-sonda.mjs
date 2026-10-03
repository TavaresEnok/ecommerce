// T23 isolado: o mesmo upload de 10 MB + 1 pelo proxy do Next (web) e direto na API, 5 vezes cada.
const origin = 'http://web:3000', rnd = () => Math.random().toString(36).slice(2, 8);
async function j(url, opt) { const r = await fetch(url, opt); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 40); } return { r, b }; }
const email = `t23-${rnd()}@example.test`, password = 'Senha-longa-T23-' + rnd() + rnd();
const H = { origin, 'content-type': 'application/json' };
const reg = await j(`${origin}/api/auth/register`, { method: 'POST', headers: H, body: JSON.stringify({ email, password }) });
await j(`${origin}/api/auth/verify-email`, { method: 'POST', headers: H, body: JSON.stringify({ token: reg.b.localToken }) });
const login = await j(`${origin}/api/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ email, password }) });
const cookie = login.r.headers.get('set-cookie').split(';')[0], csrf = login.b.csrf;
const t = await j(`${origin}/api/tenants`, { method: 'POST', headers: { ...H, cookie, 'x-csrf-token': csrf }, body: JSON.stringify({ name: 'T23 TESTE', slug: `t23-${rnd()}` }) });
const big = Buffer.alloc(10 * 1024 * 1024 + 1), out = { web: [], api: [] };
for (const [k, url] of [['web', `http://web:3000/api/tenants/${t.b.id}/catalogue/media`], ['api', `http://api:3001/tenants/${t.b.id}/catalogue/media`]])
  for (let i = 0; i < 30; i++) { try { await fetch(url, { method: 'POST', headers: { origin, cookie, 'x-csrf-token': csrf, 'content-type': 'application/octet-stream' }, body: Buffer.from('<svg><script>evil</script></svg>') }).then((r) => r.text()); const r = await fetch(url, { method: 'POST', headers: { origin, cookie, 'x-csrf-token': csrf, 'content-type': 'application/octet-stream' }, body: big }); out[k].push(`${r.status}:${(await r.text()).slice(0, 25).replace(/\s+/g, ' ')}`); } catch (e) { out[k].push(`erro:${e.cause?.code || e.message}`); } }
const tally = (a) => a.reduce((m, x) => (m[x.split(':')[0]] = (m[x.split(':')[0]] || 0) + 1, m), {}); console.log(JSON.stringify({ web: tally(out.web), api: tally(out.api) }));
