import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

import type { Client } from "../../src/client/types.js";

bench("client-20", () => {
  const contract = {
    getRoute0: {
      method: "GET" as const,
      path: "/items/0",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute1: {
      method: "GET" as const,
      path: "/items/1",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute2: {
      method: "GET" as const,
      path: "/items/2",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute3: {
      method: "GET" as const,
      path: "/items/3",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute4: {
      method: "GET" as const,
      path: "/items/4",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute5: {
      method: "GET" as const,
      path: "/items/5",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute6: {
      method: "GET" as const,
      path: "/items/6",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute7: {
      method: "GET" as const,
      path: "/items/7",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute8: {
      method: "GET" as const,
      path: "/items/8",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute9: {
      method: "GET" as const,
      path: "/items/9",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute10: {
      method: "GET" as const,
      path: "/items/10",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute11: {
      method: "GET" as const,
      path: "/items/11",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute12: {
      method: "GET" as const,
      path: "/items/12",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute13: {
      method: "GET" as const,
      path: "/items/13",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute14: {
      method: "GET" as const,
      path: "/items/14",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute15: {
      method: "GET" as const,
      path: "/items/15",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute16: {
      method: "GET" as const,
      path: "/items/16",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute17: {
      method: "GET" as const,
      path: "/items/17",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute18: {
      method: "GET" as const,
      path: "/items/18",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
    getRoute19: {
      method: "GET" as const,
      path: "/items/19",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
  } satisfies ContractDef;
  return {} as Client<typeof contract>;
}).types([86661, "instantiations"]);
