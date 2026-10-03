// T23 repro: oversized media upload through the web proxy must always answer 413, never 500.
// Usage: node tests/t23-repro.mjs [attempts] [parallel]
import { seed, client } from '../scripts/seed.mjs';
const api=client(process.env.BASE_URL),n=Number(process.argv[2]||40),parallel=Number(process.argv[3]||1),[a]=await seed(api),counts={};
const once=async()=>{let s;try{s=(await api(`tenants/${a.id}/catalogue/media`,{method:'POST',actor:a.actor,raw:Buffer.alloc(10*1024*1024+1)})).status;}catch(e){s=`erro:${e.cause?.code||e.message}`;}counts[s]=(counts[s]||0)+1;};
for(let i=0;i<n;i+=parallel)await Promise.all(Array.from({length:Math.min(parallel,n-i)},once));
console.log(JSON.stringify({attempts:n,parallel,counts}));process.exit(Object.keys(counts).join()==='413'?0:1);
