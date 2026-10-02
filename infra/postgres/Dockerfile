FROM postgres:17.9-bookworm
COPY infra/postgres/init.sh /docker-entrypoint-initdb.d/01-roles.sh
RUN sed -i 's/\r$//' /docker-entrypoint-initdb.d/01-roles.sh && chmod 755 /docker-entrypoint-initdb.d/01-roles.sh \
 && mkdir -p /var/lib/postgresql/wal-archive && chown postgres:postgres /var/lib/postgresql/wal-archive && chmod 700 /var/lib/postgresql/wal-archive
