import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

test('Stripe requires an authentic, recent signature over the exact raw body', () => {
 const stripe = new Stripe('sk_test_fixture');
 const payload = JSON.stringify({ id: 'evt_fixture', type: 'invoice.paid' });
 const secret = 'whsec_fixture';
 const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
 assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, 'evt_fixture');
 assert.throws(() => stripe.webhooks.constructEvent(payload.replace('paid','failed'), header, secret));
 assert.throws(() => stripe.webhooks.constructEvent(payload, '', secret));
 const old = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now()/1000)-3600 });
 assert.throws(() => stripe.webhooks.constructEvent(payload, old, secret));
});
test('ElevenLabs verifies usage webhooks and rejects body tampering and stale signatures', async () => {
 const client = new ElevenLabsClient({ apiKey: 'fixture' });
 const payload = JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: 'fixture' } });
 const secret = 'webhook_fixture';
 const sign = (t: number) => `t=${t},v0=${createHmac('sha256',secret).update(`${t}.${payload}`).digest('hex')}`;
 const current = sign(Math.floor(Date.now()/1000));
 assert.equal((await client.webhooks.constructEvent(payload, current, secret)).data.conversation_id, 'fixture');
 await assert.rejects(client.webhooks.constructEvent(payload.replace('fixture','forged'), current, secret));
 await assert.rejects(client.webhooks.constructEvent(payload, '', secret));
 await assert.rejects(client.webhooks.constructEvent(payload, sign(Math.floor(Date.now()/1000)-3600), secret));
});
