// Il segreto vuoto, su una riga che può finire con \n o con \r\n.
const EMPTY_SECRET = /^BETTER_AUTH_SECRET=[ \t]*(?=\r?$)/m;

/** Il contenuto di .env: parte dall'esempio se manca e riempie solo un segreto vuoto. */
export function prepareEnvFile(example: string, existing: string | undefined, secret: string): string {
  return (existing ?? example).replace(EMPTY_SECRET, `BETTER_AUTH_SECRET=${secret}`);
}
