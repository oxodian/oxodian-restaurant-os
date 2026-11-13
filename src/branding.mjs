import {HttpError} from './domain.mjs';
// Only bounded raster PNGs are accepted. SVG, external URLs and executable data are rejected.
export function validateLogo(value){
 if(value==='')return '';
 if(typeof value!=='string'||value.length>48000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new HttpError(400,'Choose a small PNG logo');
 let bytes;try{bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));}catch{throw new HttpError(400,'Invalid logo');}
 const signature=[137,80,78,71,13,10,26,10];if(bytes.length<45||signature.some((v,i)=>bytes[i]!==v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new HttpError(400,'Invalid PNG logo');
 const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);if(!width||!height||width>320||height>320)throw new HttpError(400,'Logo must be at most 320 pixels');
 return value;
}

export function validateProfileLogo(value){
 const logo=validateLogo(value);
 if(!logo)return '';
 const header=Uint8Array.from(atob(logo.slice(22,54)),c=>c.charCodeAt(0));
 const view=new DataView(header.buffer);
 if(view.getUint32(16)!==view.getUint32(20))throw new HttpError(400,'Crop the business logo to a square');
 return logo;
}
