import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
let failures = 0;
function check(ok, message) { console.log(`${ok ? 'OK' : 'PENDING'} ${message}`); if (!ok) failures++; }
check(process.env.NEXT_PUBLIC_ACCOUNT_MODE === 'true', 'Account mode enabled for this build');
for (const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','LILAILA_APP_URL','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PLUS_PRICE_ID','CRON_SECRET']) check(!!process.env[key], key);
if (process.env.LILAILA_APP_URL) check(/^https:\/\//.test(process.env.LILAILA_APP_URL), 'HTTPS application URL');
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
 const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: {persistSession:false} });
 const {data,error} = await db.from('ai_policy').select('enabled,monthly_micro_usd,max_voice_concurrent').single();
 check(!error && !!data, 'Database migration and server credentials');
 if(data) { check(data.enabled, 'AI policy enabled after acceptance tests'); console.log(`AI ceiling: $${data.monthly_micro_usd/1e6}/calendar month; voice concurrency ${data.max_voice_concurrent}`); }
}
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PLUS_PRICE_ID) {
 try {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  for (const [key,amount,interval] of [['STRIPE_PLUS_PRICE_ID',699,'month'],['STRIPE_PLUS_YEAR_PRICE_ID',4999,'year'],['STRIPE_VOICE_PRICE_ID',1299,'month']]) {
   if(!process.env[key]) continue;
   const p = await stripe.prices.retrieve(process.env[key]);
   check(p.active && p.currency==='eur' && p.unit_amount===amount && p.recurring?.interval===interval && p.recurring?.interval_count===1, `${key} matches published offer`);
  }
 } catch { check(false, 'Stripe connection'); }
}
for (const key of ['REVENUECAT_SECRET_KEY','REVENUECAT_WEBHOOK_SECRET','NEXT_PUBLIC_REVENUECAT_IOS_KEY']) check(!!process.env[key], `${key} (compras de Apple)`);
if (process.env.LILAILA_VOICE_ENABLED === 'true') for (const key of ['ELEVENLABS_API_KEY','ELEVENLABS_WEBHOOK_SECRET','STRIPE_VOICE_PRICE_ID']) check(!!process.env[key], key);
console.log('Also required: SMTP delivery, privacy/consent review, signed webhook delivery, paid/refund/cancel tests, real-device voice/push, offsite backup restore. See docs/market-launch.md.');
process.exitCode = failures ? 1 : 0;
