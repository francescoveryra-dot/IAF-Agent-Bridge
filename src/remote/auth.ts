import { timingSafeEqual } from "node:crypto";

export function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice("Bearer ".length));
  const required = Buffer.from(expected);
  if (presented.length === 0 || presented.length !== required.length) return false;
  return timingSafeEqual(presented, required);
}
