/** v1.2.0 introduced server-owned grading. Old bundled clients must upgrade. */
export const MINIMUM_MOBILE_VERSION_CODE=5;
export function mobileCompatibilityError(request:Request){
  const path=new URL(request.url).pathname;
  if(!/^\/api\/(practice|study-packs)(\/|$)/.test(path))return null;
  const native=request.headers.get('authorization')?.startsWith('Bearer ')||['https://localhost','capacitor://localhost'].includes(request.headers.get('origin')||'');
  if(!native)return null;
  const raw=request.headers.get('x-app-version-code');
  const version=raw&&/^\d+$/.test(raw)?Number(raw):0;
  if(version>=MINIMUM_MOBILE_VERSION_CODE)return null;
  return {error:'هذه النسخة قديمة ولا تدعم تصحيح الاختبارات الحالي. حمّل التطبيق الرسمي وحدّثه من صفحة التحميل. لم تُخصم حصة لهذا الطلب.',code:'APP_UPDATE_REQUIRED',minimumVersionCode:MINIMUM_MOBILE_VERSION_CODE,downloadUrl:'/download'};
}
