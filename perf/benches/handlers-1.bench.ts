import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

import type { Handlers } from "../../src/server/serve.js";

bench("handlers-1", () => {
  const contract = {
    getRoute0: {
      method: "GET" as const,
      path: "/items/0",
      query: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: { not_found: 404, forbidden: 403 } as const,
    },
  } satisfies ContractDef;
  return {} as Handlers<typeof contract, unknown>;
}).types([75498, "instantiations"]);
