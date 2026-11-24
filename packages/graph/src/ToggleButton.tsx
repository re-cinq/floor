import ControlIcon from "./ControlIcon";

interface ToggleButtonProps {
  label: string;
  icon: string;
  isOn?: boolean;
  onToggle: () => void;
}

export default function ToggleButton({ label, icon, isOn, onToggle }: ToggleButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={isOn} onClick={onToggle}>
      <ControlIcon icon={icon} />
    </button>
  );
}
