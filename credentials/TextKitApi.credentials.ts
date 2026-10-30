import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TextKitApi implements ICredentialType {
	name = 'textKitApi';

	displayName = 'TextKit API';

	icon = 'file:textkit.svg' as const;

	documentationUrl = 'https://jointextkit.com/docs/quickstart';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'ssms_sk_...',
			description:
				'A TextKit API key from the console (API Keys page). A test key sends to the sandbox; a live key sends real texts.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.jointextkit.com/v1',
			description: 'Leave as is unless TextKit support gave you another API host',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// GET /messages?limit=1 answers 200 for any valid key (test or live) and
	// 401 for a missing, malformed or revoked one. It is not billed.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/messages',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
