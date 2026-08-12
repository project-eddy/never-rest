import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

bench("plain-5", () => {
  const contract = {
    getRoute0: {
      method: "GET" as const,
      path: "/items/0",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute1: {
      method: "GET" as const,
      path: "/items/1",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute2: {
      method: "GET" as const,
      path: "/items/2",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute3: {
      method: "GET" as const,
      path: "/items/3",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute4: {
      method: "GET" as const,
      path: "/items/4",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
  };
  return contract;
}).types([76410, "instantiations"]);
