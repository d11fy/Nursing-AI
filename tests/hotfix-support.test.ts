import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {bootDatabase,db} from './helpers/harness';
before(bootDatabase);
after(()=>db.close());
test('support config and website link share the editable official number',async()=>{
  const {GET}=await import('../app/api/support/config/route');
  const {getSupportWhatsapp,whatsappUrl}=await import('../lib/support-contact');
  assert.equal((await (await GET()).json()).whatsapp,'+972567508786');
  assert.match(whatsappUrl(await getSupportWhatsapp()),/^https:\/\/wa\.me\/972567508786\?text=/);
  await db.query("update settings set value='\"+972567500000\"'::jsonb where key='support_whatsapp_number'");
  assert.equal((await (await GET()).json()).whatsapp,'+972567500000');
  assert.match((await GET()).headers.get('Cache-Control')??'',/no-store/);
});
