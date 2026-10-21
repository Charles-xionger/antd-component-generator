import { createHash } from "node:crypto";
import { appBlueprintSchema } from "@/lib/app-contracts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function validationContextDigest(runtimeType: "STATIC" | "GO", blueprint?: unknown) {
  const parsed = blueprint === undefined || blueprint === null ? null : appBlueprintSchema.parse(blueprint);
  return createHash("sha256").update(JSON.stringify(canonical({ runtimeType, blueprint: parsed }))).digest("hex");
}
