import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Checks a `textkit-signature` header (`t=<unix>,v1=<hex>[,v1=<hex>]`).
 * v1 = HMAC-SHA256(secret, `${t}.${rawBody}`), hex. Two v1 values appear during
 * a secret rotation; either may match. Rejects timestamps more than
 * `toleranceSec` from now (replay protection). Same scheme as
 * https://jointextkit.com/docs/webhooks#verify-signatures.
 */
export function verifyTextKitSignature(
	rawBody: string | Buffer,
	header: string | undefined,
	secret: string,
	toleranceSec = 300,
	nowSec = Math.floor(Date.now() / 1000),
): boolean {
	if (!header || !secret) return false;
	const parts = header.split(',').map((p) => {
		const i = p.indexOf('=');
		return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
	});
	const t = parts.find(([k]) => k === 't')?.[1];
	const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
	if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
	if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
	const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
	const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
	const exp = Buffer.from(expected);
	return sigs.some((v) => {
		const got = Buffer.from(v);
		return got.length === exp.length && timingSafeEqual(got, exp);
	});
}
