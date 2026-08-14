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
	{
		id: 'dev-persona',
		title: '程序员人格测试',
		description: '十道题，编译出一种程序员人格。有梗，但认真。',
		href: '/tools/dev-persona',
		label: 'Persona Test',
		glyph: '☽',
	},
	{
		id: 'speed-lab',
		title: 'Website Speed Lab',
		description: '把一次网站加载画成带评分的性能时间轴。能测则测，不能测就标明。',
		href: '/tools/speed-lab',
		label: 'Speed Lab',
		glyph: '⌁',
	},
];
