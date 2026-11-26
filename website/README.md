The public documentation site for floor, built with Astro Starlight.

```
# From the repository root
npm ci
npm run build -w @re-cinq/floor-contracts
npm run build -w @re-cinq/floor-client
npm ci --prefix website
npm run docs:dev
npm run docs:build
```

Link between pages with absolute paths that include the base, such as `/floor/concepts/assembly-line/`, because the link validator accepts that form.

The website build resolves the Station SDK’s npm latest version, tests the example workers against that exact package, and generates the API tables from its shipped declarations. The package introduction comes from the current SDK source. The daily Pages build picks up newly approved npm releases. Run `npm run sdk:generate --prefix website` to exercise this locally.

The Graph SDK build downloads Playwright’s headless Chromium on first use, tests the React example in that browser, and bundles the same component for the embedded demo. Run `node sdk/graph/build.mjs` from `website/` to check just that example and its reference.
