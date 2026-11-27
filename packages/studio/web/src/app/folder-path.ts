export function subfolderPath(parent: string, folder: string): string {
  return parent.endsWith("/") ? `${parent}${folder}` : `${parent}/${folder}`;
}
