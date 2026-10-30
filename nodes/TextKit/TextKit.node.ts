import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { textKitApiRequest, textKitApiRequestAllItems } from './GenericFunctions';

export class TextKit implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TextKit',
		name: 'textKit',
		icon: 'file:textkit.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send SMS and verification codes with TextKit',
		defaults: { name: 'TextKit' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'textKitApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Message', value: 'message' },
					{ name: 'Verification', value: 'verification' },
				],
				default: 'message',
			},

			// ---------------- Message ----------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{ name: 'Send', value: 'send', action: 'Send an SMS', description: 'Send an SMS' },
					{ name: 'Get', value: 'get', action: 'Get a message', description: 'Get a message by ID' },
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many messages',
						description: 'List messages, newest first',
					},
				],
				default: 'send',
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+15005550006',
				description: 'Recipient phone number in E.164 format',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Message',
				name: 'body',
				type: 'string',
				required: true,
				default: '',
				typeOptions: { rows: 3 },
				description: 'Text to send, up to 1,600 characters',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				options: [
					{
						displayName: 'Category',
						name: 'category',
						type: 'options',
						options: [
							{ name: 'Marketing', value: 'marketing' },
							{ name: 'One-Time Code', value: 'otp' },
							{ name: 'Transactional', value: 'transactional' },
						],
						default: 'transactional',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'string',
						default: '',
						placeholder: '+15005550100',
						description:
							'One of your numbers, or a sender pool ID (pool_...). Optional when the account has exactly one number for the key.',
					},
					{
						displayName: 'Scheduled At',
						name: 'scheduled_at',
						type: 'dateTime',
						default: '',
						description: 'Send later, up to 30 days out',
					},
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						placeholder: 'spring-sale, onboarding',
						description: 'Comma-separated labels, up to 10',
					},
				],
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'msg_a1B2c3D4e5F6g7H8',
				displayOptions: { show: { resource: ['message'], operation: ['get'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['message'], operation: ['getAll'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				description: 'Max number of results to return',
				displayOptions: {
					show: { resource: ['message'], operation: ['getAll'], returnAll: [false] },
				},
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Created After',
						name: 'created_after',
						type: 'dateTime',
						default: '',
					},
					{
						displayName: 'Created Before',
						name: 'created_before',
						type: 'dateTime',
						default: '',
					},
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						options: [
							{ name: 'Inbound', value: 'inbound' },
							{ name: 'Outbound', value: 'outbound' },
						],
						default: 'inbound',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'string',
						default: '',
						description: 'Exact sending number (E.164)',
					},
					{
						displayName: 'Number',
						name: 'number',
						type: 'string',
						default: '',
						description: 'Messages to or from this number',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Blocked', value: 'blocked' },
							{ name: 'Delivered', value: 'delivered' },
							{ name: 'Failed', value: 'failed' },
							{ name: 'Queued', value: 'queued' },
							{ name: 'Received', value: 'received' },
							{ name: 'Sent', value: 'sent' },
						],
						default: 'delivered',
					},
					{
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
					},
					{
						displayName: 'To',
						name: 'to',
						type: 'string',
						default: '',
						description: 'Exact destination number (E.164)',
					},
				],
			},

			// ---------------- Verification ----------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['verification'] } },
				options: [
					{
						name: 'Send Code',
						value: 'send',
						action: 'Send a verification code',
						description: 'Text or email a one-time code',
					},
					{
						name: 'Check Code',
						value: 'check',
						action: 'Check a verification code',
						description: 'Check the code the user entered',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Channel',
				name: 'channel',
				type: 'options',
				options: [
					{ name: 'SMS', value: 'sms' },
					{ name: 'Email', value: 'email' },
				],
				default: 'sms',
				displayOptions: { show: { resource: ['verification'] } },
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+14155550132',
				displayOptions: { show: { resource: ['verification'], channel: ['sms'] } },
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['verification'], channel: ['email'] } },
			},
			{
				displayName: 'Code',
				name: 'code',
				type: 'string',
				required: true,
				default: '',
				description: 'The code the user entered',
				displayOptions: { show: { resource: ['verification'], operation: ['check'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'verifyFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['verification'], operation: ['send'] } },
				options: [
					{
						displayName: 'App Name',
						name: 'app_name',
						type: 'string',
						default: '',
						description: 'Your product name, shown in the message (up to 24 characters)',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'string',
						default: '',
						description: 'SMS only: send from one of your numbers instead of the TextKit pool',
					},
					{
						displayName: 'User IP',
						name: 'user_ip',
						type: 'string',
						default: '',
						description: "Your end user's IP address, used for per-IP rate limits",
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject | IDataObject[] = {};

				if (resource === 'message') {
					if (operation === 'send') {
						const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						result = await textKitApiRequest.call(
							this,
							'POST',
							'/messages',
							buildSendBody(
								this.getNodeParameter('to', i) as string,
								this.getNodeParameter('body', i) as string,
								extra,
							),
						);
					} else if (operation === 'get') {
						const id = encodeURIComponent(this.getNodeParameter('messageId', i) as string);
						result = await textKitApiRequest.call(this, 'GET', `/messages/${id}`);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = compact(this.getNodeParameter('filters', i, {}) as IDataObject);
						const max = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
						result = await textKitApiRequestAllItems.call(this, '/messages', filters, max);
					}
				} else if (resource === 'verification') {
					const channel = this.getNodeParameter('channel', i) as string;
					const target: IDataObject =
						channel === 'email'
							? { email: this.getNodeParameter('email', i) as string }
							: { phone: this.getNodeParameter('phone', i) as string };
					if (operation === 'send') {
						const extra = compact(this.getNodeParameter('verifyFields', i, {}) as IDataObject);
						result = await textKitApiRequest.call(this, 'POST', '/verify', {
							channel,
							...target,
							...extra,
						});
					} else if (operation === 'check') {
						result = await textKitApiRequest.call(this, 'POST', '/verify/check', {
							...target,
							code: this.getNodeParameter('code', i) as string,
						});
					}
				}

				const rows = Array.isArray(result) ? result : [result];
				out.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(rows), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}
		return [out];
	}
}

/** Drops empty optional fields so the API never sees `""`. */
export function compact(obj: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === '' || v === undefined || v === null) continue;
		out[k] = v;
	}
	return out;
}

/** POST /messages body from the node's fields. */
export function buildSendBody(to: string, body: string, extra: IDataObject): IDataObject {
	const fields = compact(extra);
	const out: IDataObject = { to, body };
	if (fields.from) out.from = fields.from;
	if (fields.category) out.category = fields.category;
	if (fields.scheduled_at) out.scheduled_at = new Date(fields.scheduled_at as string).toISOString();
	if (typeof fields.tags === 'string') {
		const tags = fields.tags
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (tags.length) out.tags = tags;
	}
	return out;
}
