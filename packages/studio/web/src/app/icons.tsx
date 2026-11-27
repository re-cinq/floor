import type { ReactNode } from "react";

export function FolderIcon() {
  return <Icon><path d="M3 6h6l2 2h10v11H3z" /></Icon>;
}

export function FileIcon() {
  return <Icon><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /></Icon>;
}

export function UpIcon() {
  return <Icon><path d="M12 20V5" /><path d="M6 11l6-6 6 6" /></Icon>;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
