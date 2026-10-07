import { z } from "zod";
export const mobileLoginInput = z.object({
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  state: z.string().regex(/^[a-f0-9]{64}$/),
  scheme: z.enum(["nursingai", "nursingai-preview"]).default("nursingai"),
  deviceToken: z.string().regex(/^[a-f0-9]{64}$/),
});
