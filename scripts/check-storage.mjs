import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { s3,bucket } from '@ecommerce/media';
let ready=false;
for(let i=0;i<25;i++){
  try{await s3.send(new HeadBucketCommand({Bucket:bucket}),{abortSignal:AbortSignal.timeout(2000)});ready=true;break;}
  catch{await new Promise(resolve=>setTimeout(resolve,1000));}
}
s3.destroy();
if(!ready){console.error('S3 autenticado indisponível ou bucket inexistente; nenhum bucket foi recriado.');process.exit(1);}
console.log('S3 autenticado pronto; bucket existente preservado.');
