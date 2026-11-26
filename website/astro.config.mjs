// @ts-check
import { defineConfig } from 'astro/config';
import mermaid from 'astro-mermaid';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';

// https://astro.build/config
export default defineConfig({
	// Project site is served under the repo-name subpath, so assets and links
	// must be prefixed with `base` or they resolve to the domain root and 404.
	site: 'https://re-cinq.github.io',
	base: '/floor',
	integrations: [
		// astro-mermaid must be registered before starlight so its remark/rehype
		// transforms wrap the ```mermaid fenced blocks before Starlight renders them.
		mermaid({
			theme: 'default',
			autoTheme: true,
		}),
		starlight({
			title: 'Floor',
			description: 'A workflow engine for pipelines of AI agents.',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/re-cinq/floor',
				},
			],
			plugins: [starlightLinksValidator(), starlightLlmsTxt()],
			customCss: ['./src/styles/re-cinq-tokens.css', './src/styles/custom.css'],
			sidebar: [
				{ label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
				{ label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
				{ label: 'Tutorials', items: [{ autogenerate: { directory: 'tutorials' } }] },
				{ label: 'Cookbook', items: [{ autogenerate: { directory: 'cookbook' } }] },
				{ label: 'Specifications', items: [{ autogenerate: { directory: 'specs' } }] },
				{ label: 'SDKs', items: [{ autogenerate: { directory: 'sdk' } }] },
				{ label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
			],
		}),
	],
});
