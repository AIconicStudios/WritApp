import { route } from "@/lib/http";
export const GET = route(async (_req, user) => ({ user }));
