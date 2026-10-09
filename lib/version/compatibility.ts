import { getAppVersionInfo } from './app-version';

/** Code 5 was released without an X-App-Version-Code header. Missing means unknown, not zero. */
export async function mobileCompatibilityError(request:Request){
  const path=new URL(request.url).pathname;
  if(!/^\/api\/(practice|study-packs)(\/|$)/.test(path))return null;
  const native=request.headers.get('authorization')?.startsWith('Bearer ')||['https://localhost','capacitor://localhost'].includes(request.headers.get('origin')||'');
  if(!native)return null;
  const raw=request.headers.get('x-app-version-code');
  const installedCode=raw&&/^\d{1,9}$/.test(raw)?Number(raw):null;
  if(installedCode===null)return null;
  const release=await getAppVersionInfo();
  const minimumCode=release.minimum_supported_version_code,latestCode=release.latest_version_code;
  if(process.env.VERSION_DEBUG==='1')console.info('mobile-version-decision',{installedCode,minimumCode,latestCode,forceUpdate:installedCode<minimumCode});
  if(installedCode>=minimumCode)return null;
  return {error:'هذه النسخة لا تدعم واجهة الاختبارات الحالية. حدّث التطبيق من صفحة التحميل.',code:'APP_UPDATE_REQUIRED',minimumVersionCode:minimumCode,latestVersionCode:latestCode,downloadUrl:'/download'};
}
