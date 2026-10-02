import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const test = process.argv.includes('--test');
const file = resolve(root, test ? '.local/test.env' : '.env');
if (existsSync(file)) {
  if (!/^BACKUP_DB_PASSWORD=/m.test(readFileSync(file,'utf8'))) appendFileSync(file,`\nBACKUP_DB_PASSWORD=${randomBytes(32).toString('hex')}\n`);
  const current=readFileSync(file,'utf8');
    for(const [key,value] of Object.entries({S3_ACCESS_KEY:randomBytes(16).toString('hex'),S3_SECRET_KEY:randomBytes(32).toString('hex'),S3_ENDPOINT:'http://storage:8333',S3_BUCKET:'pilot-private',PAYMENT_SIMULATION:'true',PAYMENT_ENCRYPTION_KEY:randomBytes(32).toString('hex'),MFA_ENCRYPTION_KEY:randomBytes(32).toString('hex')})) {
      if(!new RegExp(`^${key}=`,'m').test(current))appendFileSync(file,`${key}=${value}\n`);
    }
    console.log('Configuração existente preservada; chaves locais ausentes adicionadas, valores omitidos.'); process.exit(0);
}
mkdirSync(resolve(root, '.local'), { recursive: true });
const secret = () => randomBytes(32).toString('hex');
const [bootstrap, migration, app, auth, cookie, backup] = Array.from({length: 6}, secret);
const env = test ? 'test' : 'development';
writeFileSync(file, `APP_ENV=${env}\nNODE_ENV=${env}\nLOCAL_MAILBOX=true\nPUBLIC_ORIGIN=http://localhost:3000\nAPI_INTERNAL_URL=http://api:3001\nPORT=3001\nPOSTGRES_PASSWORD=${bootstrap}\nMIGRATION_DB_PASSWORD=${migration}\nAPP_DB_PASSWORD=${app}\nAUTH_DB_PASSWORD=${auth}\nDATABASE_URL=postgresql://app_user:${app}@postgres:5432/ecommerce\nAUTH_DATABASE_URL=postgresql://auth_user:${auth}@postgres:5432/ecommerce\nMIGRATION_DATABASE_URL=postgresql://migration_user:${migration}@postgres:5432/ecommerce\nREDIS_URL=redis://redis:6379\nCOOKIE_SECRET=${cookie}\nBACKUP_DB_PASSWORD=${backup}\nS3_ACCESS_KEY=${secret()}\nS3_SECRET_KEY=${secret()}\nS3_ENDPOINT=http://storage:8333\nS3_BUCKET=pilot-private\nPAYMENT_SIMULATION=true\nPAYMENT_ENCRYPTION_KEY=${secret()}\nMFA_ENCRYPTION_KEY=${secret()}\n`, { mode: 0o600 });
console.log(`Configuração ${env} gerada com segredos aleatórios (valores omitidos).`);
