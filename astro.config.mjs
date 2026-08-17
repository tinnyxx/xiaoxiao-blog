// @ts-check

import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://xiaoxiaoptopfile.top',
	// Astro 7 默认 output: 'static'（等同旧版 hybrid）：
	// 页面默认预渲染，只有声明 `export const prerender = false` 的路由跑在服务端。
	adapter: node({ mode: 'standalone' }),
	// 站内 /api/* 是无鉴权的公开接口（不依赖 Cookie 会话），CSRF 同源校验意义有限；
	// 且 standalone 模式不解析 X-Forwarded-Proto，HTTPS 反代后 Astro 会把 origin
	// 误判成 http://，导致同源 POST 被 403。故关闭 checkOrigin。
	security: {
		checkOrigin: false,
	},
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
		ssr: {
			// transformers.js 需要在运行时从 node_modules 加载 ONNX 模型文件，
			// 不能被打包器内联，否则找不到模型资源。
			external: ['@huggingface/transformers'],
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
