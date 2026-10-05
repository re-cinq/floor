## Why

<!-- What problem does this change solve, or what goal does it advance? Link to an issue or decision document if relevant. -->

## What Changed

<!-- Describe the concrete changes: which packages, which behaviour, which invariants were touched or added. -->

## Alternatives Considered

<!-- What other approaches did you evaluate and why did you choose this one? "None" is a valid answer for obvious fixes. -->

## ADRs & Architecture

<!-- Does this change a documented decision (docs/decisions.md) or add a new one? Does it touch the wire contract (packages/contracts), the walk kernel (packages/assembly-lines), or the storage model (packages/store)? Call it out here. -->

## Testing

<!-- How was this tested? Include the commands you ran. Note any manual steps (e.g. running against minikube with walk-*.sh). -->

---

**Checklist**

- [ ] `npm run build && npm test` passes locally
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (or `lint:fix` applied)
- [ ] No secrets, tokens, or credentials in source or chart values
- [ ] `docs/decisions.md` updated if a non-obvious choice was made
- [ ] Wire contract changes are reflected in both server and client types
