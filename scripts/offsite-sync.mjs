// Runs inside the staging tests image: encrypts and ships backups to the separate "offsite" S3 (fictitious substitute
// for the external provider), copies media objects, and fetches the latest dump back for a restore drill.
//   node scripts/offsite-sync.mjs push | pull
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
const need=n=>{const v=process.env[n];if(!v)throw new Error(`${n} ausente`);return v;};
const key=Buffer.from(need('OFFSITE_BACKUP_KEY'),'hex');if(key.length!==32)throw new Error('OFFSITE_BACKUP_KEY deve ter 32 bytes');
const offsite=new S3Client({region:'us-east-1',endpoint:need('OFFSITE_S3_ENDPOINT'),forcePathStyle:true,credentials:{accessKeyId:need('OFFSITE_S3_ACCESS_KEY'),secretAccessKey:need('OFFSITE_S3_SECRET_KEY')}});
const primary=new S3Client({region:'us-east-1',endpoint:need('S3_ENDPOINT'),forcePathStyle:true,credentials:{accessKeyId:need('S3_ACCESS_KEY'),secretAccessKey:need('S3_SECRET_KEY')}});
const BUCKET='offsite-backups',work='/staging/offsite';
// Separate key from the application's keys; AES-256-GCM with the object name as associated data.
const seal=(data,name)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(name));const body=Buffer.concat([c.update(data),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);};
const open=(data,name)=>{const d=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));d.setAAD(Buffer.from(name));d.setAuthTag(data.subarray(12,28));return Buffer.concat([d.update(data.subarray(28)),d.final()]);};
const bytes=async r=>Buffer.from(await r.Body.transformToByteArray());
async function ensureBucket(){try{await offsite.send(new HeadBucketCommand({Bucket:BUCKET}));}catch{await offsite.send(new CreateBucketCommand({Bucket:BUCKET}));}}
const mode=process.argv[2],stamp=new Date().toISOString().replace(/[:.]/g,'-'),manifest={stamp,objects:[]};
await ensureBucket();
if(mode==='push'){
 for(const file of readdirSync(work).filter(f=>/\.(dump|tgz)$/.test(f))){const name=`postgres/${stamp}/${file}.enc`,data=readFileSync(`${work}/${file}`);await offsite.send(new PutObjectCommand({Bucket:BUCKET,Key:name,Body:seal(data,name)}));manifest.objects.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
 let token,media=0;do{const page=await primary.send(new ListObjectsV2Command({Bucket:need('S3_BUCKET'),ContinuationToken:token}));for(const o of page.Contents??[]){const data=await bytes(await primary.send(new GetObjectCommand({Bucket:need('S3_BUCKET'),Key:o.Key})));const name=`media/${o.Key}.enc`;await offsite.send(new PutObjectCommand({Bucket:BUCKET,Key:name,Body:seal(data,name)}));media++;}token=page.IsTruncated?page.NextContinuationToken:undefined;}while(token);
 manifest.media_objects=media;const mname=`manifests/${stamp}.json`;await offsite.send(new PutObjectCommand({Bucket:BUCKET,Key:mname,Body:seal(Buffer.from(JSON.stringify(manifest)),mname)}));
 console.log(JSON.stringify({pushed:manifest.objects.length,media,stamp}));
}else if(mode==='pull'){
 const list=await offsite.send(new ListObjectsV2Command({Bucket:BUCKET,Prefix:'manifests/'}));const latest=(list.Contents??[]).map(o=>o.Key).sort().at(-1);if(!latest)throw new Error('Nenhum backup externo.');
 const m=JSON.parse(open(await bytes(await offsite.send(new GetObjectCommand({Bucket:BUCKET,Key:latest}))),latest).toString());
 for(const o of m.objects){const data=open(await bytes(await offsite.send(new GetObjectCommand({Bucket:BUCKET,Key:o.name}))),o.name);if(createHash('sha256').update(data).digest('hex')!==o.sha256)throw new Error(`Integridade falhou: ${o.name}`);writeFileSync(`${work}/restored-${o.name.split('/').pop().replace('.enc','')}`,data);}
 console.log(JSON.stringify({pulled:m.objects.length,media:m.media_objects,stamp:m.stamp,integrity:'sha256 ok'}));
}else{console.error('Uso: push|pull');process.exit(2);}
