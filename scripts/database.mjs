import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function database(path=':memory:'){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY)');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort()){if(!name.endsWith('.sql')||sqlite.prepare('SELECT name FROM _migrations WHERE name=?').get(name))continue;sqlite.exec('BEGIN');try{sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));sqlite.prepare('INSERT INTO _migrations(name) VALUES(?)').run(name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 const db={sqlite,prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args),success:true};},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}};}};return statement;},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements){results.push(await statement.all());}sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};return db;
}
