// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://xiaoxiaoptopfile.top',
	integrations: [mdx(), sitemap()],
	vite: {
		server: {
			proxy: {
				'/api/bili-userinfo': {
					target: 'https://uapis.cn',
					changeOrigin: true,
					rewrite: (path) =>
						path.replace(/^\/api\/bili-userinfo/, '/api/v1/social/bilibili/userinfo'),
				},
			},
		},
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
