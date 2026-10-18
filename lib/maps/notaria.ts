/**
 * Notarías are out of the daily list and the drip, including rows saved
 * before they left the rotation. Category matches notaría/notario; the name
 * check catches "Notaría Pública No. 4" even when the stored giro is another.
 */
export function isNotariaBusiness(input: {
  name?: string | null;
  specialty?: string | null;
  giro?: string | null;
}): boolean {
  if (isNotariaCategory(input.specialty) || isNotariaCategory(input.giro)) return true;
  return fold(input.name ?? "").startsWith("notaria");
}

function isNotariaCategory(value: string | null | undefined): boolean {
  return /(^|\s)notari/.test(fold(value ?? ""));
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
