import type { Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";
import { GUEST_USER } from "../db.js";

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Fallback to Guest User if authentication fails
    user = GUEST_USER;
  }

  // Ensure user is never null for this "public" app
  if (!user) {
    user = GUEST_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
