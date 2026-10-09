import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideUpdate,parseVersionResponse} from '../mobile/src/services/release';
import {bootDatabase,db} from './helpers/harness';
const release=parseVersionResponse({latest_version:'1.2.0',latest_version_code:5,minimum_supported_version_code:5,apk_url:'/api/download/apk',release_notes:'',force_update:true,published_at:'2026-10-09T08:00:00Z',available:true})!;
test('installed code 6 is supported when minimum 5 even if server latest is 5 and force flag is true',()=>{
  assert.deepEqual(decideUpdate(6,release),{show:false,force:false});
  assert.deepEqual(decideUpdate(5,release),{show:false,force:false});
  assert.deepEqual(decideUpdate(4,release),{show:true,force:true});
});
test('API compatibility uses current minimum, accepts code 6 and legacy missing code, rejects code 4',async()=>{
  await bootDatabase();
  const {mobileCompatibilityError}=await import('../lib/version/compatibility');
  const request=(code?:string)=>new Request('https://nursing.example.test/api/practice/generate',{headers:{authorization:'Bearer fake',...(code?{'x-app-version-code':code}:{})}});
  assert.equal(await mobileCompatibilityError(request('6')),null);
  assert.equal(await mobileCompatibilityError(request()),null);
  assert.equal((await mobileCompatibilityError(request('4')))?.code,'APP_UPDATE_REQUIRED');
  await db.query("update settings set value=jsonb_set(value,'{minimum_supported_version_code}','7'::jsonb) where key='mobile_app_version'");
  assert.equal((await mobileCompatibilityError(request('6')))?.minimumVersionCode,7,'the next request reads the new database setting');
  await db.close();
});
