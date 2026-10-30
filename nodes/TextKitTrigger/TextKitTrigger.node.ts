import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { textKitApiRequest } from '../TextKit/GenericFunctions';
import { verifyTextKitSignature } from './signature';

type StaticData = { webhookId?: string; webhookSecret?: string };

export class TextKitTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TextKit Trigger',
		name: 'textKitTrigger',
		icon: 'file:textkit.svg',
		group: ['trigger'],
		version: 1,
		subtitle: 'On inbound SMS',
		description: 'Starts the workflow when one of your TextKit numbers receives a text',
		defaults: { name: 'TextKit Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'textKitApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'Message Received',
						value: 'message.received',
						description: 'An inbound SMS arrived on one of your numbers',
					},
				],
				default: 'message.received',
			},
			{
				displayName: 'Numbers',
				name: 'numbers',
				type: 'string',
				default: '',
				placeholder: '+14155550132, +14155550133',
				description:
					'Comma-separated list of your numbers to listen on (E.164). Leave empty for every number.',
			},
			{
				displayName: 'Ignore Simulated Messages',
				name: 'ignoreSimulated',
				type: 'boolean',
				default: false,
				description:
					'Whether to skip inbound messages a test key simulated (simulated: true). Turn on in production.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				const url = this.getNodeWebhookUrl('default');
				if (data.webhookId && data.webhookSecret) {
					try {
						const ep = await textKitApiRequest.call(
							this,
							'GET',
							`/webhooks/${encodeURIComponent(data.webhookId)}`,
						);
						if (ep.url === url) return true;
					} catch {
						// Gone (404) or unreadable: fall through and re-create.
					}
				}
				// An endpoint for this URL that we no longer hold the secret for can't
				// be verified against, so remove it; create() makes a fresh one.
				const list = await textKitApiRequest.call(this, 'GET', '/webhooks');
				for (const ep of (list.data as IDataObject[]) ?? []) {
					if (ep.url === url && ep.id) {
						await textKitApiRequest.call(
							this,
							'DELETE',
							`/webhooks/${encodeURIComponent(ep.id as string)}`,
						);
					}
				}
				delete data.webhookId;
				delete data.webhookSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const event = this.getNodeParameter('event') as string;
				const numbers = String(this.getNodeParameter('numbers', '') || '')
					.split(',')
					.map((n) => n.trim())
					.filter(Boolean);
				const body: IDataObject = {
					url,
					events: [event],
					description: 'n8n workflow trigger',
				};
				if (numbers.length) body.numbers = numbers;
				const ep = await textKitApiRequest.call(this, 'POST', '/webhooks', body);
				if (!ep.id || !ep.secret) return false;
				const data = this.getWorkflowStaticData('node') as StaticData;
				data.webhookId = ep.id as string;
				data.webhookSecret = ep.secret as string;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				if (data.webhookId) {
					try {
						await textKitApiRequest.call(
							this,
							'DELETE',
							`/webhooks/${encodeURIComponent(data.webhookId)}`,
						);
					} catch {
						return false;
					}
				}
				delete data.webhookId;
				delete data.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer | string };
		const headers = this.getHeaderData();
		const body = this.getBodyData();
		const data = this.getWorkflowStaticData('node') as StaticData;
		const res = this.getResponseObject();

		const header = (headers['textkit-signature'] ?? headers['dsms-signature']) as
			| string
			| undefined;
		const raw = req.rawBody ?? JSON.stringify(body);
		if (!data.webhookSecret || !verifyTextKitSignature(raw, header, data.webhookSecret)) {
			res.status(401).json({ error: 'invalid_signature' });
			return { noWebhookResponse: true };
		}

		const event = this.getNodeParameter('event') as string;
		if (body.type !== event) return {};
		const msg = (body.data ?? {}) as IDataObject;
		if (msg.simulated === true && this.getNodeParameter('ignoreSimulated', false)) {
			return {};
		}

		return {
			workflowData: [
				this.helpers.returnJsonArray([
					{
						event_id: body.id,
						type: body.type,
						mode: body.mode,
						created_at: body.created_at,
						...msg,
					},
				]),
			],
		};
	}
}
