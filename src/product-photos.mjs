import {HttpError} from './domain.mjs';
export function validateProductPhoto(value){
 if(value==='')return '';
 if(typeof value!=='string'||value.length>48000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new HttpError(400,'Use a compressed 400×400 JPG photo');
 let bytes;try{bytes=Uint8Array.from(atob(value.slice(23)),c=>c.charCodeAt(0));}catch{throw new HttpError(400,'Invalid JPG photo');}
 if(bytes.length<100||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new HttpError(400,'Invalid JPG photo');
 let width=0,height=0;for(let pos=2;pos+4<bytes.length;){if(bytes[pos]!==255)break;let marker=bytes[++pos];while(marker===255)marker=bytes[++pos];pos++;if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;const length=(bytes[pos]<<8)|bytes[pos+1];if(length<2||pos+length>bytes.length)break;if([192,193,194].includes(marker)){height=(bytes[pos+3]<<8)|bytes[pos+4];width=(bytes[pos+5]<<8)|bytes[pos+6];break;}pos+=length;}
 if(width!==400||height!==400)throw new HttpError(400,'Photo must be cropped to 400×400 pixels');return value;
}
