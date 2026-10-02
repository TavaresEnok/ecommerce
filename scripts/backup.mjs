import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { composeArgs, docker, root } from './compose.mjs';
const test=process.argv.includes('--test');
const mode=process.argv.find(a=>['--backup','--restore-test'].includes(a));
if (!mode || !existsSync(join(root,test?'.local/test.env':'.env'))) { console.error('Uso: node scripts/backup.mjs --backup|--restore-test [--test]. Configure primeiro o ambiente.');process.exit(2); }
try {
  const compose=composeArgs(test);
  if(mode==='--backup') {
    docker([...compose,'exec','-T','postgres','sh','-ec','export PGPASSWORD="$BACKUP_DB_PASSWORD"; pg_dump -h 127.0.0.1 -U backup_user -d ecommerce --format=custom --file=/tmp/foundation.dump']);
    console.log('Backup lógico criado em /tmp/foundation.dump no container PostgreSQL; copie-o para destino seguro antes de recriar o container.');
  } else {
    // Nome fixo e diferente da origem; nenhuma base de origem é removida.
    docker([...compose,'exec','-T','postgres','sh','-ec','export PGPASSWORD="$MIGRATION_DB_PASSWORD"; test -s /tmp/foundation.dump; createdb -h 127.0.0.1 -U migration_user ecommerce_restore; pg_restore -h 127.0.0.1 -U migration_user -d ecommerce_restore --exit-on-error /tmp/foundation.dump; psql -h 127.0.0.1 -U migration_user -d ecommerce_restore -v ON_ERROR_STOP=1 -c "REVOKE ALL ON DATABASE ecommerce_restore FROM PUBLIC; GRANT CONNECT ON DATABASE ecommerce_restore TO app_user,auth_user"']);
    console.log('Restauração concluída em ecommerce_restore. Conferências de dados/RLS são feitas pelo runner de verificação.');
  }
} catch(error) {console.error(error.message);process.exit(error.exitCode||1);}
