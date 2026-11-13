import {readdirSync} from 'node:fs';import {execFileSync} from 'node:child_process';
for(const folder of ['src','public','scripts'])for(const file of readdirSync(folder))if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',folder+'/'+file],{stdio:'inherit',windowsHide:true});
console.log('All application modules passed syntax checks.');
