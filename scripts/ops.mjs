// Operator CLI. Executes scripts/ops-tasks.mjs inside the worker image; never prints secrets.
import { composeArgs, docker } from './compose.mjs';
const args=process.argv.slice(2),test=args.includes('--test'),rest=args.filter(a=>a!=='--test');
if(!rest.length){console.error('Uso: node scripts/ops.mjs <status|suspend|reactivate|resume-sales|post-restore|reapply-erasures|pilot-report|support-time> [argumentos] [--database=ecommerce_restore] [--test]');process.exit(2);}
try{docker([...composeArgs(test),'run','--rm','--no-deps','worker','node','scripts/ops-tasks.mjs',...rest],{timeout:120000});}catch(error){console.error(error.message);process.exit(error.exitCode||1);}
