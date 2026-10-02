import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { newId, rows, sql, withTenant, type Database } from '@ecommerce/database';
export const MAX_INPUT=10*1024*1024;
export const QUOTA=1024*1024*1024;
export const MAX_DERIVED=8*1024*1024;
export const s3=new S3Client({region:'us-east-1',endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,maxAttempts:2,requestHandler:{connectionTimeout:5000,requestTimeout:20000},credentials:{accessKeyId:process.env.S3_ACCESS_KEY || '',secretAccessKey:process.env.S3_SECRET_KEY || ''}});
export const bucket=process.env.S3_BUCKET || 'pilot-private';
sharp.cache(false);sharp.concurrency(1);
export async function initializeStorage() {
  try {await s3.send(new HeadBucketCommand({Bucket:bucket}));}
  catch(error) {if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw error; await s3.send(new CreateBucketCommand({Bucket:bucket}));}
}
export async function validateImage(input:Buffer) {
  if(!input.length || input.length>MAX_INPUT)throw new Error('IMAGE_SIZE');
  const metadata=await sharp(input,{limitInputPixels:40_000_000,failOn:'warning',animated:true}).metadata();
  if(!['jpeg','png','webp'].includes(metadata.format || '') || !metadata.width || !metadata.height || metadata.width*metadata.height>40_000_000 || (metadata.pages || 1)>1)throw new Error('IMAGE_CONTENT');
  await sharp(input,{limitInputPixels:40_000_000,failOn:'warning'}).resize({width:1,height:1}).raw().timeout({seconds:15}).toBuffer();
  if(metadata.format==='png'){
    for(let offset=8;offset+12<=input.length;){const length=input.readUInt32BE(offset);if(length>input.length-offset-12)throw new Error('PNG_TRUNCATED');if(input.toString('ascii',offset+4,offset+8)==='acTL')throw new Error('PNG_ANIMATED');offset+=length+12;}
  }
  return metadata;
}
export const putObject=(key:string,body:Buffer,contentType:string)=>s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:contentType}));
export async function getObject(key:string) {const data=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await data.Body!.transformToByteArray());}
export const deleteObject=(key:string)=>s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
type Asset={id:string;status:string;original_key:string;created_at:Date;content_hash:string};
export async function processMedia(database:Database,tenantId:string,assetId:string) {
  const asset=await withTenant(database,tenantId,null,async tx=>(await rows<Asset>(tx,sql`select id,status,original_key,created_at,content_hash from shop.media_assets where id=${assetId}`))[0]);
  if(!asset || asset.status==='READY' || asset.status==='DELETED' || asset.status==='FAILED')return;
  if(asset.status!=='PENDING')throw new Error('IMAGE_NOT_UPLOADED');
  const input=await getObject(asset.original_key); await validateImage(input);
    if(createHash('sha256').update(input).digest('hex')!==asset.content_hash)throw new Error('IMAGE_HASH');
  const renditions:{key:string;width:number;height:number;bytes:number}[]=[]; let bytes=0;
  for(const width of [480,1280]) {
    const {data,info}=await sharp(input,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width,withoutEnlargement:true}).webp({quality:80}).timeout({seconds:15}).toBuffer({resolveWithObject:true});
    bytes+=data.length; if(bytes>8*1024*1024)throw new Error('DERIVED_LIMIT');
    const key=`tenant/${tenantId}/public/${assetId}/v1-${width}.webp`;
    await putObject(key,data,'image/webp');renditions.push({key,width:info.width,height:info.height,bytes:data.length});
  }
  // Readiness is durable before removal of the private original. Retries use immutable keys.
  await withTenant(database,tenantId,null,async tx=>{
    await tx.execute(sql`select id from shop.tenants where id=${tenantId} for update`);
    const changed=await tx.execute(sql`update shop.media_assets set status='READY',renditions=${JSON.stringify(renditions)}::jsonb,stored_bytes=${bytes},updated_at=now() where id=${assetId} and status='PENDING'`);
    if(changed.rowCount)await tx.execute(sql`update shop.media_usage set stored_bytes=stored_bytes+${bytes} where tenant_id=${tenantId}`);
    // Strict quota: the reservation ends exactly once, when the asset becomes READY.
    const [reservation]=await rows<{bytes:string}>(tx,sql`update shop.media_reservations set status='COMMITTED',ended_at=now() where asset_id=${assetId} and status='ACTIVE' returning bytes::text`);
    if(reservation)await tx.execute(sql`update shop.media_usage set reserved_bytes=greatest(0,reserved_bytes-${reservation.bytes}::bigint) where tenant_id=${tenantId}`);
  });
  await deleteObject(asset.original_key);
  await withTenant(database,tenantId,null,tx=>tx.execute(sql`update shop.media_usage set stored_bytes=greatest(0,stored_bytes-${input.length}) where tenant_id=${tenantId}`));
  return {assetId,processed:true};
}
export async function reconcileMedia(database:Database,tenantId:string) {
  let continuation:string|undefined; const sizes=new Map<string,number>(); const stale:string[]=[];
  do {
    const result=await s3.send(new ListObjectsV2Command({Bucket:bucket,Prefix:`tenant/${tenantId}/`,ContinuationToken:continuation}));
    for(const object of result.Contents || []) {if(object.Key){sizes.set(object.Key,object.Size || 0);if(object.Key.includes('/temporary/') && object.LastModified && Date.now()-object.LastModified.getTime()>86400000)stale.push(object.Key);}}
    continuation=result.NextContinuationToken;
  }while(continuation);
  const expired=await withTenant(database,tenantId,null,tx=>rows<{original_key:string}>(tx,sql`select original_key from shop.media_assets where created_at<now()-interval '24 hours' and status in ('UPLOADING','PENDING','FAILED','READY')`));
  for(const key of new Set([...stale,...expired.map(a=>a.original_key)])){await deleteObject(key);sizes.delete(key);}
  await withTenant(database,tenantId,null,async tx=>{
    await tx.execute(sql`select id from shop.tenants where id=${tenantId} for update`);
    let pendingMissing=0;
    const assets=await rows<{id:string;original_key:string;original_bytes:string;renditions:{key:string}[];status:string}>(tx,sql`select id,original_key,original_bytes::text,renditions,status from shop.media_assets`);
    for(const asset of assets) {
      let total=[...sizes.entries()].filter(([key])=>key===asset.original_key || key.startsWith(`tenant/${tenantId}/public/${asset.id}/`)).reduce((sum,[,size])=>sum+size,0);
      if(asset.status==='UPLOADING'&&!sizes.has(asset.original_key)&&!expired.some(a=>a.original_key===asset.original_key)){total+=Number(asset.original_bytes);pendingMissing+=Number(asset.original_bytes);}
      await tx.execute(sql`update shop.media_assets set stored_bytes=${total},status=case when status in ('UPLOADING','PENDING') and created_at<now()-interval '24 hours' then 'FAILED' when status='UPLOADING' and ${sizes.has(asset.original_key)} then 'PENDING' else status end,updated_at=now() where id=${asset.id}`);
    }
    // Abandoned/failed uploads release their reservation; reserved_bytes is recomputed from the reservation ledger.
    await tx.execute(sql`update shop.media_reservations r set status='RELEASED',ended_at=now() from shop.media_assets a where a.id=r.asset_id and r.status='ACTIVE' and (r.expires_at<now() or a.status in ('FAILED','DELETED','READY'))`);
    const [held]=await rows<{bytes:string}>(tx,sql`select coalesce(sum(bytes),0)::text as bytes from shop.media_reservations where status='ACTIVE'`);
    const actual=[...sizes.values()].reduce((a,b)=>a+b,0)+pendingMissing;
    await tx.execute(sql`insert into shop.media_usage(id,tenant_id,stored_bytes,reserved_bytes,reconciled_at) values(${newId()},${tenantId},${actual},${held!.bytes}::bigint,now()) on conflict(tenant_id) do update set stored_bytes=excluded.stored_bytes,reserved_bytes=excluded.reserved_bytes,reconciled_at=now()`);
  });
  return {reconciled:true,bytes:[...sizes.values()].reduce((a,b)=>a+b,0)};
}
// Privacy ledger lives outside the database so that erasures can be reapplied after restoring an older backup.
export async function listKeys(prefix:string){const keys:string[]=[];let token:string|undefined;do{const page=await s3.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,ContinuationToken:token}));for(const item of page.Contents||[])if(item.Key)keys.push(item.Key);token=page.IsTruncated?page.NextContinuationToken:undefined;}while(token);return keys;}
export const erasureLedgerKey=(tenant:string,erasure:string)=>`privacy-ledger/${tenant}/${erasure}.json`;
