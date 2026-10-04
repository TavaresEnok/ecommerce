#!/usr/bin/env node
// Baixa as fotos de demonstração das lojas de exemplo (licença CC0/domínio público, via Openverse) e grava em
// scripts/fixtures/fotos/ com o registro de origem em fotos.json. Uso único, com rede: node scripts/fixtures/fetch-photos.mjs
// As fotos são só para dados de demonstração; nunca substituem fotos de lojas reais.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'fotos');
const sharp = createRequire(join(here, '../../packages/media/package.json'))('sharp');
// Openverse ids escolhidos na revisão das pranchas (ver docs/design/REFERENCIAS.md).
const PICKS = {
  // chave -> { q: consulta usada, i: posição no resultado, source }
  'editorial-bolsa-rosa': { q: 'handbag', i: 2 }, 'editorial-bolsa-preta': { q: 'handbag', i: 1 },
  'editorial-colar-coracao': { q: 'necklace', i: 5 }, 'editorial-oculos-aviador': { q: 'sunglasses', i: 0 }, 'editorial-oculos-laranja': { q: 'sunglasses', i: 3 },
  'editorial-carteira': { q: 'wallet', i: 0 }, 'editorial-relogio': { q: 'watch', i: 0 }, 'editorial-camisa': { q: 'necklace', i: 1 }, 'editorial-pulseiras': { q: 'bracelet', i: 4 },
  'editorial-brinco': { q: 'earrings', i: 0, sources: 'wordpress,rawpixel' }, 'editorial-botas': { q: 'leather boots', i: 2, sources: 'wordpress,rawpixel' }, 'editorial-botas-2': { q: 'leather boots', i: 3, sources: 'wordpress,rawpixel' },
  'essencial-teclado-mecanico': { q: 'keyboard', i: 4 }, 'essencial-teclado-branco': { q: 'keyboard', i: 3 }, 'essencial-teclado-azul': { q: 'keyboard', i: 5 }, 'essencial-mouse': { q: 'mouse computer', i: 3 },
  'essencial-fone-mesa': { q: 'headphones', i: 2 }, 'essencial-fone-preto': { q: 'headphones', i: 3 }, 'essencial-fone-vermelho': { q: 'headphones', i: 1 },
  'essencial-caixa-azul': { q: 'speaker', i: 1 }, 'essencial-caixa-azul-2': { q: 'speaker', i: 0 }, 'essencial-caixa-estante': { q: 'speaker', i: 2 },
  'essencial-garrafa-termica': { q: 'bottle', i: 1 }, 'essencial-garrafa': { q: 'bottle', i: 2 }, 'essencial-mochila': { q: 'backpack', i: 3 },
  'essencial-relogio-classico': { q: 'clock', i: 2 }, 'essencial-relogio-minimal': { q: 'clock', i: 5 }, 'essencial-luminaria': { q: 'lamp', i: 1 }, 'essencial-caderno': { q: 'notebook', i: 1 },
  'atelie-copos': { q: 'pottery', i: 2 }, 'atelie-bule-verde': { q: 'teapot', i: 3 }, 'atelie-tigelas': { q: 'bowl', i: 1 }, 'atelie-cesto': { q: 'basket', i: 0 }, 'atelie-vaso-barro': { q: 'pottery', i: 0 },
  'atelie-vaso-branco': { q: 'vase', i: 1 }, 'atelie-porta-velas': { q: 'candle', i: 2 }, 'atelie-cachepo': { q: 'plant pot', i: 0 }, 'atelie-colher': { q: 'spoon', i: 0 }, 'atelie-tecidos': { q: 'textile', i: 3 },
  'atelie-jarro': { q: 'pottery', i: 5 }, 'atelie-bule-floral': { q: 'teapot', i: 0 },
  'casos-oculos-png': { q: 'sunglasses', i: 1, sources: 'wordpress,rawpixel', png: true },
};
mkdirSync(out, { recursive: true });
const credits = {}, cache = {};
for (const [key, pick] of Object.entries(PICKS)) {
  const sources = pick.sources ?? 'wordpress', page = pick.sources ? 6 : 8, ck = `${pick.q}|${sources}|${page}`;
  if (!cache[ck]) { const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(pick.q)}&license=cc0,pdm&page_size=${page}&mature=false&source=${sources}`); cache[ck] = (await r.json()).results; await new Promise((r) => setTimeout(r, 500)); }
  const item = cache[ck][pick.i]; if (!item) { console.error('sem resultado', key); continue; }
  const file = `${key}.${pick.png ? 'png' : 'jpg'}`;
  if (!existsSync(join(out, file))) {
    const res = await fetch(item.url); if (!res.ok) { console.error('falhou download', key, res.status); continue; }
    const img = sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true });
    await (pick.png ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 82, mozjpeg: true })).toFile(join(out, file));
  }
  credits[file] = { openverse_id: item.id, title: item.title, creator: item.creator ?? null, license: item.license, license_url: item.license_url, source: item.source, landing_url: item.foreign_landing_url, original_url: item.url, retrieved: new Date().toISOString().slice(0, 10) };
  console.log('✔', file, item.license, item.source);
}
writeFileSync(join(here, 'fotos.json'), JSON.stringify(credits, null, 2) + '\n');
