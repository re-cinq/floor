import type { Crumb } from "./breadcrumbs";
import { withExactSelection } from "@/socket/fragment";
import shell from "./shell.module.css";

export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumbs" className={shell.breadcrumbs}>
      <ol>
        {crumbs.map(({ label, selection }) => (
          <li key={label}>
            {selection ? <a href={withExactSelection(window.location.hash, selection)}>{label}</a> : <span aria-current="page">{label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
