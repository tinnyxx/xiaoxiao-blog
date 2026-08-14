export interface BuildingItem {
	title: string;
	note: string;
	/** Rendered as a small mono tag on the right of the row. */
	stage?: string;
}

export const building: BuildingItem[] = [
	{
		title: 'AI Tools',
		note: '把常用的模型调用包成顺手的小工具。',
		stage: 'WIP',
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
