/** True for `/demo` and `/demo/<giro>`. `/demographics` stays protected. */
export function isPublicDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}
