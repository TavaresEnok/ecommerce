import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, assertApplicationRole } from '@ecommerce/database';
import { Queue } from 'bullmq';

export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
export const localMailbox = () => process.env.LOCAL_MAILBOX === 'true' && ['development','test'].includes(process.env.APP_ENV || '');
export function redisConnection() {
  const url = new URL(required('REDIS_URL'));
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, maxRetriesPerRequest: null };
}
@Injectable()
export class Infrastructure implements OnApplicationShutdown {
  readonly shop = createDatabase(required('DATABASE_URL'));
  readonly access = createDatabase(required('AUTH_DATABASE_URL'), 2);
  readonly queue = new Queue('foundation', { connection: redisConnection() });
  async checkRoles() {
    await assertApplicationRole(this.shop, 'app_user');
    await assertApplicationRole(this.access, 'auth_user');
  }
  async onApplicationShutdown() { await this.queue.close(); await this.shop.pool.end(); await this.access.pool.end(); }
}
@Global()
@Module({ providers: [Infrastructure], exports: [Infrastructure] })
export class InfrastructureModule {}
