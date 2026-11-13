import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const name='oxodian-restaurant-os-preview',databaseName='oxodian-ros-staging';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const commands={deploy:['deploy'],migrate:['d1','migrations','apply','DB','--remote']};

export function validatePreview(config,databases){
 const [binding]=config.d1_databases||[];
 if(config.name!==name||config.vars?.ENVIRONMENT!=='ros-preview'||
    config.workers_dev!==false||config.preview_urls!==false||
    config.routes?.length!==1||config.routes[0].pattern!=='preview.ros.oxodian.com'||
    config.routes[0].custom_domain!==true||config.d1_databases?.length!==1||
    binding?.binding!=='DB'||binding.database_name!==databaseName||
    !binding.database_id||binding.database_id==='00000000-0000-0000-0000-000000000000')
  throw Error('Configure the dedicated ROS preview Worker, hostname and D1 database first.');
 if(databases&&!databases.some(db=>db.name===databaseName&&db.uuid===binding.database_id))
  throw Error('The configured UUID does not match the dedicated ROS preview database in this Cloudflare account.');
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const action=process.argv[2];
  if(!Object.hasOwn(commands,action))throw Error('Choose deploy or migrate.');
  validatePreview(config);
  const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
  const list=spawnSync(process.execPath,[wrangler,'d1','list','--json','--config','wrangler.jsonc'],{cwd:root,encoding:'utf8'});
  if(list.status!==0)throw Error('Could not verify the Cloudflare D1 inventory.');
  validatePreview(config,JSON.parse(list.stdout));
  const result=spawnSync(process.execPath,[wrangler,...commands[action],'--config','wrangler.jsonc'],{cwd:root,stdio:'inherit'});
  process.exitCode=result.status??1;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
