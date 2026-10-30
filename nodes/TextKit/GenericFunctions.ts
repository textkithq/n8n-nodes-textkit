import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.jointextkit.com/v1';

/** One authenticated call to the TextKit REST API. */
export async function textKitApiRequest(
	this: IExecuteFunctions | IHookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('textKitApi');
	const baseURL = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const options: IHttpRequestOptions = {
		method,
		baseURL,
		url: path,
		json: true,
		headers: { 'User-Agent': 'n8n-nodes-textkit' },
	};
	if (body && Object.keys(body).length) options.body = body;
	if (qs && Object.keys(qs).length) options.qs = qs;
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'textKitApi',
			options,
		)) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * GET /messages pages by `cursor` (`has_more` + `next_cursor` on the response).
 * Stops at `max` items when given.
 */
export async function textKitApiRequestAllItems(
	this: IExecuteFunctions,
	path: string,
	qs: IDataObject,
	max?: number,
): Promise<IDataObject[]> {
	const out: IDataObject[] = [];
	let cursor: string | undefined;
	do {
		const pageQs: IDataObject = { ...qs, limit: 100 };
		if (max !== undefined) pageQs.limit = Math.min(100, max - out.length);
		if (cursor) pageQs.cursor = cursor;
		const page = await textKitApiRequest.call(this, 'GET', path, undefined, pageQs);
		out.push(...((page.data as IDataObject[]) ?? []));
		cursor = page.has_more ? ((page.next_cursor as string) ?? undefined) : undefined;
	} while (cursor && (max === undefined || out.length < max));
	return max === undefined ? out : out.slice(0, max);
}
