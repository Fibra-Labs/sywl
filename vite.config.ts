import {paraglideVitePlugin} from '@inlang/paraglide-js';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig, type UserConfig, loadEnv} from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig(({ mode }): UserConfig => {
	const isDev = mode === 'development';
	const config: UserConfig = {
		plugins: [
			tailwindcss(),
			sveltekit(),
			mode !== 'production' && devtoolsJson(),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide'
			})
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'client',
						environment: 'browser',
						browser: {
							enabled: true,
							provider: 'playwright',
							instances: [{ browser: 'chromium' }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**'],
						setupFiles: ['./vitest-setup-client.ts']
					}
				},
				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	}

	if (isDev) {
		config.server = {
			https: {
				key: readFileSync('./localhost-key.pem'),
				cert: readFileSync('./localhost.pem')
			}
		}
	}
	return config;
});
