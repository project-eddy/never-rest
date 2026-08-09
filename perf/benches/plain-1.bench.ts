import { bench } from "@ark/attest";
import { z } from "zod";
import { zodSchema } from "../fixtures/schema.ts";
import type { ContractDef } from "../../src/contract/types.js";

undefined as undefined;

bench("plain-1", () => {
  const contract = {
    getRoute0: {
      method: "GET" as const,
      path: "/items/0",
      input: zodSchema(z.object({ id: z.string() })),
      output: zodSchema(z.object({ id: z.string(), value: z.number() })),
      errors: ["not_found", "forbidden"] as const,
    },
  };
  return contract;
}).types([75178, "instantiations"]);
