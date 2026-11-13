import {test} from 'node:test';
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
 assert.equal(preview.d1_databases[0].database_name,'oxodian-restaurant-os-preview');
 assert.equal(new Set(restaurantNavigation.map(([id])=>id)).size,11);
});
