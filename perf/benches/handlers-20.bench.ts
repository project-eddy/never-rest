import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

import type { Handlers } from "../../src/server/serve.js";

bench("handlers-20", () => {
  const contract = {
    getRoute0: {
      method: "GET" as const,
      path: "/items/0",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute1: {
      method: "GET" as const,
      path: "/items/1",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute2: {
      method: "GET" as const,
      path: "/items/2",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute3: {
      method: "GET" as const,
      path: "/items/3",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute4: {
      method: "GET" as const,
      path: "/items/4",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute5: {
      method: "GET" as const,
      path: "/items/5",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute6: {
      method: "GET" as const,
      path: "/items/6",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute7: {
      method: "GET" as const,
      path: "/items/7",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute8: {
      method: "GET" as const,
      path: "/items/8",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute9: {
      method: "GET" as const,
      path: "/items/9",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute10: {
      method: "GET" as const,
      path: "/items/10",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute11: {
      method: "GET" as const,
      path: "/items/11",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute12: {
      method: "GET" as const,
      path: "/items/12",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute13: {
      method: "GET" as const,
      path: "/items/13",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute14: {
      method: "GET" as const,
      path: "/items/14",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute15: {
      method: "GET" as const,
      path: "/items/15",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute16: {
      method: "GET" as const,
      path: "/items/16",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute17: {
      method: "GET" as const,
      path: "/items/17",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute18: {
      method: "GET" as const,
      path: "/items/18",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
    getRoute19: {
      method: "GET" as const,
      path: "/items/19",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
  } satisfies ContractDef;
  return {} as Handlers<typeof contract, unknown>;
}).types([86605, "instantiations"]);
