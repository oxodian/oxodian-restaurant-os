import {test} from 'node:test';
import {validatePreview} from '../scripts/preview.mjs';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {restaurantNavigation} from '../public/ros-navigation.js';

test('ROS manifest, cache, preview host and navigation belong to the separate app',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const manifest=JSON.parse(read('public/manifest.webmanifest'));
 const preview=JSON.parse(read('wrangler.jsonc'));
 assert.equal(manifest.name,'Restaurant OS');
 assert.equal(manifest.display,'standalone');
 assert(manifest.icons.every(icon=>icon.src.startsWith('/ros-')&&existsSync(new URL('../public'+icon.src,import.meta.url))));
 assert.match(read('public/sw.js'),/ros-shell-/);
 assert.equal(preview.routes[0].pattern,'preview.ros.oxodian.com');
 assert.equal(preview.d1_databases[0].database_name,'oxodian-ros-staging');
 assert.equal(new Set(restaurantNavigation.map(([id])=>id)).size,11);
});

test('ROS preview refuses a placeholder, a BOS binding, or a production route',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 config.d1_databases[0].database_id='00000000-0000-0000-0000-000000000000';
 assert.throws(()=>validatePreview(config),/dedicated ROS preview/);
 const uuid='12345678-1234-4234-8234-123456789abc';
 config.d1_databases[0].database_id=uuid;
 assert.throws(()=>validatePreview(config,[{name:'oxodian-business-os-staging',uuid}]),/does not match/);
 validatePreview(config,[{name:'oxodian-ros-staging',uuid}]);
 config.routes[0].pattern='ros.oxodian.com';
 config.d1_databases[0].database_id='00000000-0000-0000-0000-000000000000';
 assert.throws(()=>validatePreview(config),/dedicated ROS preview/);
});


