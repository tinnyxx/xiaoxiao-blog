export interface BuildingItem {
	title: string;
	note: string;
	/** Rendered as a small mono tag on the right of the row. */
	stage?: string;
}

export const building: BuildingItem[] = [
	{
		title: 'RAG 问答助手',
		note: '基于文章向量检索 + DeepSeek 的博客问答。',
		stage: 'LIVE',
	},
	{
		title: 'Pet Community',
		note: '一个给养宠物的人用的社区。',
		stage: 'DESIGN',
	},
	{
		title: 'Web Experiments',
		note: '纯 CSS 的动效和交互试验。',
		stage: 'ONGOING',
	},
];
