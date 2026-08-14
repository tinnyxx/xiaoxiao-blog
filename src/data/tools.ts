export interface Tool {
	id: string;
	title: string;
	description: string;
	href: string;
	/** Short latin name used in the sidebar shelf and tool index. */
	label?: string;
	/** Single-character mark rendered in mono type next to the tool name. */
	glyph?: string;
}

export const tools: Tool[] = [
	{
		id: 'json-formatter',
		title: 'JSON 格式化',
		description: '在浏览器里美化、压缩和复制 JSON，数据不会上传到服务器。',
		href: '/tools/json-formatter',
		label: 'JSON Formatter',
		glyph: '{ }',
	},
	{
		id: 'bili-follow',
		title: 'B站关注时间',
		description: '查询你是什么时候关注某位 UP 主的，并展示该 UP 的公开资料。',
		href: '/tools/bili-follow',
		label: 'Bilibili Follow',
		glyph: '◷',
	},
];
