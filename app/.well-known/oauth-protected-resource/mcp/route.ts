import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { protectedResourceResponse } from "@/lib/mcp/protected-resource";

/** RFC 9728, à l'adresse dérivée de la ressource `/mcp`. */
export const GET = protectedResourceResponse;
export const OPTIONS = metadataCorsOptionsRequestHandler();
