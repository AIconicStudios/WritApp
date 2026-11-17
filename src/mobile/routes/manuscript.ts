// Same as the server route, with file clean-up through the phone's file store.
import * as server from "@/app/api/manuscripts/[id]/route";
export const GET = server.GET;
export const PATCH = server.PATCH;
export const DELETE = server.DELETE;
