/** The choice offered when the agent file changed on disk under unsaved edits. */
export default function DiskVersionChoice({ isPending, onTake, onKeep }: { isPending: boolean; onTake: () => void; onKeep: () => void }) {
  return (
    isPending && (
      <>
        <button type="button" onClick={onTake}>
          Take the version on disk
        </button>
        <button type="button" onClick={onKeep}>
          Keep my edits
        </button>
      </>
    )
  );
}
