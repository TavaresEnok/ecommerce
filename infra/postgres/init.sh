#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v migration_password="$MIGRATION_DB_PASSWORD" -v app_password="$APP_DB_PASSWORD" -v auth_password="$AUTH_DB_PASSWORD" -v backup_password="$BACKUP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE migration_user LOGIN NOSUPERUSER NOBYPASSRLS CREATEDB PASSWORD %L', :'migration_password') \gexec
SELECT format('CREATE ROLE app_user LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password') \gexec
SELECT format('CREATE ROLE auth_user LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', :'auth_password') \gexec
SELECT format('CREATE ROLE backup_user LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', :'backup_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO migration_user', current_database()) \gexec
REVOKE ALL ON DATABASE ecommerce FROM PUBLIC;
GRANT CONNECT ON DATABASE ecommerce TO migration_user, app_user, auth_user, backup_user;
SQL
