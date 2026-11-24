// A setting written as `${NAME}`: shown as the variable it is, with where its value comes from.
export default function EnvChip({ envName, onOverride }: { envName?: string; onOverride?: () => void }) {
  return (
    <>
      <code>env: {envName}</code>
      <span>
        An environment variable of the install that applies this collection, filled in once when it is applied; applying fails if it is not set. In Lore: set on lore-api by its Helm chart, or in
        <code>.env.local</code> when Lore runs locally.
      </span>
      <button type="button" aria-label="Override" onClick={onOverride}>Override</button>
    </>
  );
}
