import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { protectedResourceResponse } from "@/lib/mcp/protected-resource";

/** RFC 9728, à la racine, pour les clients qui ne dérivent pas le chemin. */
export const GET = protectedResourceResponse;
export const OPTIONS = metadataCorsOptionsRequestHandler();
