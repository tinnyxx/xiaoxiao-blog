export interface Tool {
	id: string;
	title: string;
	description: string;
	href: string;
}

export const tools: Tool[] = [
	{
		id: 'json-formatter',
		title: 'JSON 格式化',
		description: '在浏览器里美化、压缩和复制 JSON，数据不会上传到服务器。',
		href: '/tools/json-formatter',
	},
];
