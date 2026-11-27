// The value a person typed for a name, or undefined when it is absent or blank.
export function enteredValue(entered: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = Object.hasOwn(entered, name) ? entered[name] : undefined;

  return value?.trim() ? value : undefined;
}
