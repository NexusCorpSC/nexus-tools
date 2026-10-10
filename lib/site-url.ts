/** L'adresse publique du site, celle des liens que donnent le MCP et le chat. */
export const DEFAULT_BASE_URL = "https://tools.services.nexus";

export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL;
}
