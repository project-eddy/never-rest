import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

bench("contract-satisfies-20", () => {
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
    getRoute5: {
      method: "GET" as const,
      path: "/items/5",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute6: {
      method: "GET" as const,
      path: "/items/6",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute7: {
      method: "GET" as const,
      path: "/items/7",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute8: {
      method: "GET" as const,
      path: "/items/8",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute9: {
      method: "GET" as const,
      path: "/items/9",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute10: {
      method: "GET" as const,
      path: "/items/10",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute11: {
      method: "GET" as const,
      path: "/items/11",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute12: {
      method: "GET" as const,
      path: "/items/12",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute13: {
      method: "GET" as const,
      path: "/items/13",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute14: {
      method: "GET" as const,
      path: "/items/14",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute15: {
      method: "GET" as const,
      path: "/items/15",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute16: {
      method: "GET" as const,
      path: "/items/16",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute17: {
      method: "GET" as const,
      path: "/items/17",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute18: {
      method: "GET" as const,
      path: "/items/18",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute19: {
      method: "GET" as const,
      path: "/items/19",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
  } satisfies ContractDef;
  return contract;
}).types([86595, "instantiations"]);
