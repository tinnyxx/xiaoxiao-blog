const BLOCKED = new Set(['javascript:', 'data:', 'file:', 'blob:', 'about:']);

export function normalizeUrl(input: string): string {
	const raw = input.trim();
	if (!raw) throw new Error('请输入网站 URL。');
	const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
	let url: URL;
	try {
		url = new URL(withProto);
	} catch {
		throw new Error('URL 格式不正确。');
	}
	if (BLOCKED.has(url.protocol)) throw new Error('不支持这种地址。');
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('只支持 http 或 https。');
	}
	return url.href;
}

export function hostOf(href: string): string {
	return new URL(href).host;
}

export function isSameOrigin(href: string): boolean {
	try {
		return new URL(href).origin === location.origin;
	} catch {
		return false;
	}
}
