import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION_CODE, APP_VERSION_NAME } from '../config/version';

export interface InstalledVersion { code:number; name:string; packageId:string; source:'android'|'browser-preview' }
/** Android package metadata is authoritative; bundled JSON is only used by the browser preview. */
let cached:Promise<InstalledVersion>|null=null;
export function getInstalledVersion():Promise<InstalledVersion>{
  cached??=readInstalledVersion().catch(error=>{cached=null;throw error;});
  return cached;
}
async function readInstalledVersion():Promise<InstalledVersion>{
  if(Capacitor.isNativePlatform()){
    const info=await App.getInfo();
    const code=Number(info.build);
    if(info.id!=='com.nursingai.app'||!Number.isSafeInteger(code)||code<1)
      throw new Error('تعذر التحقق من هوية إصدار التطبيق المثبت');
    return {code,name:info.version,packageId:info.id,source:'android'};
  }
  return {code:APP_VERSION_CODE,name:APP_VERSION_NAME,packageId:'browser-preview',source:'browser-preview'};
}
