export default function EnvChip({ envName, onOverride }: { envName?: string; onOverride?: () => void }) {
  return (
    <>
      <code>env: {envName}</code>
      <span>Filled in from the host's {envName} when the collection is applied.</span>
      <button type="button" aria-label="Override" onClick={onOverride}>Override</button>
    </>
  );
}
