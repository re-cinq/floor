interface RemoveButtonProps {
  name: string;
  position: number;
  onRemove: () => void;
}

export default function RemoveButton({ name, position, onRemove }: RemoveButtonProps) {
  return (
    <button type="button" aria-label={`Remove ${name} ${position}`} onClick={onRemove}>
      Remove
    </button>
  );
}
