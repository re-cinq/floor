export function fillTemplate(template, tokens) {
  return template.replace(/{{([^}]+)}}/g, (_, key) => {
    if (!Object.hasOwn(tokens, key)) throw new Error(`Unknown SDK page token: ${key}`);
    return tokens[key];
  });
}
