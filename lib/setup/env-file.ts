const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

function keyOf(line: string): string | undefined {
  return KEY_LINE.exec(line)?.[1];
}

/** Aggiunge in fondo le righe dell'esempio con una chiave che il file non ha ancora. */
function withMissingKeys(example: string, content: string): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const present = new Set(content.split(/\r?\n/).map(keyOf));
  const missing = example.split(/\r?\n/).filter((line) => {
    const key = keyOf(line);
    return key !== undefined && !present.has(key);
  });
  if (missing.length === 0) return content;
  const base = content === "" || content.endsWith("\n") ? content : content + eol;
  return base + missing.map((line) => line + eol).join("");
}

/**
 * Il contenuto di .env: parte dall'esempio se manca, aggiunge le chiavi nuove e riempie solo
 * i valori generati ancora vuoti. Le scelte già presenti non si toccano.
 */
export function prepareEnvFile(
  example: string,
  existing: string | undefined,
  generated: Record<string, string>,
): string {
  let content = withMissingKeys(example, existing ?? example);
  for (const [key, value] of Object.entries(generated)) {
    // Il valore vuoto, su una riga che può finire con \n o con \r\n.
    const empty = new RegExp(`^${key}=[ \\t]*(?=\\r?$)`, "m");
    content = content.replace(empty, () => `${key}=${value}`);
  }
  return content;
}
