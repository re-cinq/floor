export function nounOf(listName: string) {
  return (listName.split(/[\s_]/).pop() ?? listName).replace(/s$/, "");
}

export function addLabel(name: string, caption?: string) {
  return caption ? `Add ${nounOf(caption)}` : `Add to ${name}`;
}
