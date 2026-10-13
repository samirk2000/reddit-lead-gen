/**
 * Lets `node --experimental-strip-types --test` import extensionless .ts files.
 * Not used by Next.js.
 */
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[a-z]+$/i.test(specifier);
  if (isRelative && !hasExt) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
