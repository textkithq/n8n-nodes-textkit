// Runs against the compiled dist/ (npm test builds first). No n8n runtime is
// needed: each test hands the node a minimal fake of the n8n context and
// records the HTTP requests it would make.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const { TextKit } = require('../dist/nodes/TextKit/TextKit.node.js');
const { TextKitTrigger } = require('../dist/nodes/TextKitTrigger/TextKitTrigger.node.js');
const { TextKitApi } = require('../dist/credentials/TextKitApi.credentials.js');
const { verifyTextKitSignature } = require('../dist/nodes/TextKitTrigger/signature.js');
const pkg = require('../package.json');

function fakeContext({ params = {}, responses = [], staticData = {}, items = [{ json: {} }] } = {}) {
	const calls = [];
	const ctx = {
		calls,
		staticData,
		getInputData: () => items,
		getNodeParameter: (name, _i, fallback) => {
			const v = typeof _i === 'number' || _i === undefined ? params[name] : params[name];
			if (v === undefined) return typeof _i === 'number' ? fallback : _i;
			return v;
		},
		getCredentials: async () => ({ apiKey: 'ssms_sk_test_x', baseUrl: 'https://api.jointextkit.com/v1' }),
		getNode: () => ({ name: 'TextKit', type: 'textKit', typeVersion: 1, parameters: {} }),
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc/webhook',
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async function (cred, opts) {
				calls.push({ cred, ...opts });
				const r = responses.shift();
				if (r instanceof Error) throw r;
				return r ?? {};
			},
			returnJsonArray: (rows) => rows.map((json) => ({ json })),
			constructExecutionMetaData: (rows, { itemData }) => rows.map((r) => ({ ...r, pairedItem: itemData })),
		},
	};
	return ctx;
}

test('package.json has what n8n needs to list the package', () => {
	assert.ok(pkg.keywords.includes('n8n-community-node-package'));
	assert.equal(pkg.license, 'MIT');
	assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
	for (const f of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) require(`../${f}`);
});

test('credential sends a Bearer header and tests with GET /messages?limit=1', () => {
	const c = new TextKitApi();
	assert.equal(c.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
	assert.equal(c.test.request.url, '/messages');
	assert.equal(c.test.request.method, 'GET');
	assert.deepEqual(c.test.request.qs, { limit: 1 });
});

test('Message > Send posts to /messages with optional fields', async () => {
	const ctx = fakeContext({
		params: {
			resource: 'message',
			operation: 'send',
			to: '+15005550006',
			body: 'Hello',
			additionalFields: { from: '+15005550100', tags: 'a, b ,', category: '' },
		},
		responses: [{ id: 'msg_1', status: 'delivered' }],
	});
	const [out] = await new TextKit().execute.call(ctx);
	assert.equal(ctx.calls[0].method, 'POST');
	assert.equal(ctx.calls[0].url, '/messages');
	assert.equal(ctx.calls[0].cred, 'textKitApi');
	assert.deepEqual(ctx.calls[0].body, { to: '+15005550006', body: 'Hello', from: '+15005550100', tags: ['a', 'b'] });
	assert.equal(out[0].json.id, 'msg_1');
});

test('Message > Get Many follows next_cursor and stops at the limit', async () => {
	const ctx = fakeContext({
		params: { resource: 'message', operation: 'getAll', returnAll: false, limit: 3, filters: { direction: 'inbound' } },
		responses: [
			{ data: [{ id: 'm1' }, { id: 'm2' }], has_more: true, next_cursor: 'c2' },
			{ data: [{ id: 'm3' }, { id: 'm4' }], has_more: true, next_cursor: 'c3' },
		],
	});
	const [out] = await new TextKit().execute.call(ctx);
	assert.deepEqual(out.map((o) => o.json.id), ['m1', 'm2', 'm3']);
	assert.deepEqual(ctx.calls[0].qs, { direction: 'inbound', limit: 3 });
	assert.deepEqual(ctx.calls[1].qs, { direction: 'inbound', limit: 1, cursor: 'c2' });
});

test('Verification > Send and Check hit /verify and /verify/check', async () => {
	const ctx = fakeContext({
		params: { resource: 'verification', operation: 'send', channel: 'sms', phone: '+15005550006', verifyFields: { app_name: 'Acme' } },
		responses: [{ id: 'ver_1', status: 'pending' }],
	});
	await new TextKit().execute.call(ctx);
	assert.equal(ctx.calls[0].url, '/verify');
	assert.deepEqual(ctx.calls[0].body, { channel: 'sms', phone: '+15005550006', app_name: 'Acme' });

	const ctx2 = fakeContext({
		params: { resource: 'verification', operation: 'check', channel: 'sms', phone: '+15005550006', code: '111111' },
		responses: [{ verified: true, status: 'approved' }],
	});
	const [out] = await new TextKit().execute.call(ctx2);
	assert.equal(ctx2.calls[0].url, '/verify/check');
	assert.deepEqual(ctx2.calls[0].body, { phone: '+15005550006', code: '111111' });
	assert.equal(out[0].json.verified, true);
});

test('Trigger create/delete registers and removes a message.received webhook', async () => {
	const staticData = {};
	const ctx = fakeContext({
		params: { event: 'message.received', numbers: '+14155550132' },
		staticData,
		responses: [{ id: 'we_1', url: 'https://n8n.example.com/webhook/abc/webhook', secret: 'whsec_x' }, {}],
	});
	const hooks = new TextKitTrigger().webhookMethods.default;
	assert.equal(await hooks.create.call(ctx), true);
	assert.deepEqual(ctx.calls[0].body, {
		url: 'https://n8n.example.com/webhook/abc/webhook',
		events: ['message.received'],
		description: 'n8n workflow trigger',
		numbers: ['+14155550132'],
	});
	assert.deepEqual(staticData, { webhookId: 'we_1', webhookSecret: 'whsec_x' });
	assert.equal(await hooks.delete.call(ctx), true);
	assert.equal(ctx.calls[1].method, 'DELETE');
	assert.equal(ctx.calls[1].url, '/webhooks/we_1');
	assert.deepEqual(staticData, {});
});

test('Trigger checkExists removes an endpoint for our URL whose secret we lost', async () => {
	const ctx = fakeContext({
		params: {},
		responses: [{ data: [{ id: 'we_old', url: 'https://n8n.example.com/webhook/abc/webhook' }, { id: 'we_other', url: 'https://x' }] }, {}],
	});
	assert.equal(await new TextKitTrigger().webhookMethods.default.checkExists.call(ctx), false);
	assert.equal(ctx.calls[1].method, 'DELETE');
	assert.equal(ctx.calls[1].url, '/webhooks/we_old');
	assert.equal(ctx.calls.length, 2);
});

function webhookCtx({ raw, header, secret = 'whsec_x', params = { event: 'message.received', ignoreSimulated: false } }) {
	let status = 200;
	const ctx = fakeContext({ params, staticData: { webhookId: 'we_1', webhookSecret: secret } });
	ctx.getRequestObject = () => ({ rawBody: Buffer.from(raw) });
	ctx.getHeaderData = () => ({ 'textkit-signature': header });
	ctx.getBodyData = () => JSON.parse(raw);
	ctx.getResponseObject = () => ({ status: (s) => ((status = s), { json: () => {} }) });
	return { ctx, status: () => status };
}
const sign = (raw, secret = 'whsec_x', t = Math.floor(Date.now() / 1000)) =>
	`t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

test('Trigger webhook emits the inbound message when the signature is valid', async () => {
	const raw = JSON.stringify({
		id: 'evt_1', object: 'event', type: 'message.received', mode: 'test', created_at: '2026-08-13T00:41:00.000Z',
		data: { message_id: 'msg_1', from: '+14155550132', to: '+15005550100', body: 'Hi', simulated: true },
	});
	const { ctx } = webhookCtx({ raw, header: sign(raw) });
	const res = await new TextKitTrigger().webhook.call(ctx);
	assert.equal(res.workflowData[0][0].json.message_id, 'msg_1');
	assert.equal(res.workflowData[0][0].json.event_id, 'evt_1');
});

test('Trigger webhook answers 401 to a bad signature and runs nothing', async () => {
	const raw = JSON.stringify({ type: 'message.received', data: {} });
	const { ctx, status } = webhookCtx({ raw, header: sign(raw, 'whsec_wrong') });
	const res = await new TextKitTrigger().webhook.call(ctx);
	assert.equal(status(), 401);
	assert.equal(res.noWebhookResponse, true);
	assert.equal(res.workflowData, undefined);
});

test('signature: rotation (two v1), stale timestamp, malformed header', () => {
	const raw = '{"a":1}';
	const t = 1755043260;
	const good = createHmac('sha256', 'new').update(`${t}.${raw}`).digest('hex');
	const old = createHmac('sha256', 'old').update(`${t}.${raw}`).digest('hex');
	assert.equal(verifyTextKitSignature(raw, `t=${t},v1=${good},v1=${old}`, 'old', 300, t), true);
	assert.equal(verifyTextKitSignature(raw, `t=${t},v1=${good}`, 'new', 300, t + 301), false);
	assert.equal(verifyTextKitSignature(raw, 'garbage', 'new', 300, t), false);
	assert.equal(verifyTextKitSignature(raw, undefined, 'new', 300, t), false);
});
