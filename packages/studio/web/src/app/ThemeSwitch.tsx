import { SCHEME_PREFS, type SchemePref } from "@/theme/scheme";
import styles from "./shell.module.css";

export interface ThemeSwitchProps {
  pref: SchemePref;
  onChoose: (pref: SchemePref) => void;
}

export default function ThemeSwitch({ pref, onChoose }: ThemeSwitchProps) {
  return (
    <fieldset className={styles.scheme}>
      <legend>Color scheme</legend>
      {SCHEME_PREFS.map((option) => (
        <label key={option}>
          <input type="radio" name="color-scheme" value={option} checked={pref === option} onChange={() => onChoose(option)} />
          {option}
        </label>
      ))}
    </fieldset>
  );
}
