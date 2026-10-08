import { createClient } from '@supabase/supabase-js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
// Local app, dedicated preview database, synthetic accounts only; no email or AI calls.
const origin = process.env.LILAILA_APP_URL;
if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error('Only a local preview is supported');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const users=[];
const out = await mkdtemp(join(tmpdir(),'lilaila-http-qa-'));
async function request(path,{cookie='',method='GET',body,owner,foreign=false}={}) {
 return fetch(origin+path,{method,headers:{origin:foreign?'https://untrusted.invalid':origin,cookie,...(body?{'content-type':'application/json'}:{}),...(owner?{'x-lilaila-owner':owner}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
async function identity() {
 const email=`qa-${crypto.randomUUID()}@lilaila.invalid`;
 const {data,error}=await db.auth.admin.createUser({email,email_confirm:true,app_metadata:{lilaila_test_fixture:true}});
 if(error)throw new Error(error.message);
 users.push(data.user.id);
 const {data:link,error:linkError}=await db.auth.admin.generateLink({type:'magiclink',email});
 if(linkError)throw new Error(linkError.message);
 const response=await request('/api/auth',{method:'POST',body:{email,token:link.properties.email_otp}});
 assert.equal(response.status,200);
 const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 assert.ok(cookie);
 return {id:data.user.id,email,cookie};
}
try {
 assert.equal((await request('/api/data')).status,401);
 const a=await identity(),b=await identity();
 const doc={version:1,revision:0,days:[{date:'2026-10-08',note:'SYNTHETIC QA NOTE'}],cycles:[],memories:[],settings:{id:'singleton',name:'Prueba'}};
 assert.equal((await request('/api/data',{method:'PUT',cookie:a.cookie,owner:a.id,body:doc})).status,200);
 assert.equal((await (await request('/api/data',{cookie:b.cookie})).json()).days.length,0);
 assert.equal((await request('/api/data',{method:'PUT',cookie:b.cookie,owner:a.id,body:doc})).status,409);
 assert.equal((await request('/api/data',{method:'PUT',cookie:a.cookie,owner:a.id,body:doc})).status,409);
 assert.equal((await request('/api/partner',{method:'POST',cookie:a.cookie,foreign:true})).status,403);
 const invitation=await (await request('/api/partner',{method:'POST',cookie:a.cookie})).json();
 assert.ok(invitation.token);
 assert.equal((await request('/api/cookie-monster/auth',{method:'POST',cookie:b.cookie,body:{pin:invitation.token}})).status,200);
 assert.equal((await request('/api/cookie-monster/auth',{method:'POST',cookie:b.cookie,body:{pin:invitation.token}})).status,400);
 assert.equal((await (await request('/api/cookie-monster/auth',{cookie:b.cookie})).json()).authenticated,true);
 assert.equal((await request('/api/partner',{method:'DELETE',cookie:a.cookie})).status,200);
 assert.equal((await (await request('/api/cookie-monster/auth',{cookie:b.cookie})).json()).authenticated,false);
 assert.equal((await request('/api/voz/directo',{method:'POST',cookie:a.cookie,body:{}})).status,503);
 assert.equal((await request('/api/billing/checkout',{method:'POST',cookie:a.cookie,body:{plan:'plus'}})).status,503);
 assert.equal((await request('/api/data',{method:'DELETE',cookie:a.cookie,owner:a.id})).status,200);
 assert.equal((await request('/api/data',{method:'PUT',cookie:a.cookie,owner:a.id,body:{...doc,revision:1}})).status,409);
 assert.equal((await (await request('/api/data',{cookie:a.cookie})).json()).days.length,0);
 assert.equal((await request('/api/auth',{method:'DELETE',cookie:a.cookie})).status,200);
 console.log('PASS: two authenticated accounts, isolation, stale writes, CSRF, partner invite/revoke, unavailable paid features, erasure tombstone, logout. No emails or provider calls.');
 if(process.argv.includes('--keep-for-ui')) {
  const {data:link,error}=await db.auth.admin.generateLink({type:'magiclink',email:b.email});
  if(error)throw error;
  await writeFile(join(out,'fixture.json'),JSON.stringify({users,email:b.email,otp:link.properties.email_otp}),{mode:0o600});
  console.log('Synthetic UI fixture:',join(out,'fixture.json'));
 } else { for(const id of users)await db.auth.admin.deleteUser(id); await rm(out,{recursive:true,force:true}); }
} catch(error) {
 for(const id of users)await db.auth.admin.deleteUser(id);
 await rm(out,{recursive:true,force:true});
 throw error;
}
