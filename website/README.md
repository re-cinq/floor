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

The website build generates the Station SDK reference from its public entry point. The example in `defineStation` includes the named region in its unit test. Run `npm test -w @re-cinq/floor-station` to exercise it.
