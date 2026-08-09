import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

import type { Client } from "../../src/client/types.js";

bench("combined-1", () => {
  const contract = {
    getRoute0: {
      method: "GET" as const,
      path: "/items/0",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
  } satisfies ContractDef;
  return {} as Client<typeof contract>;
}).types([75505, "instantiations"]);
