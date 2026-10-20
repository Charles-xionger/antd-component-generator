import { z } from "zod";

export const appIntentSchema = z.enum([
  "CREATE_APP",
  "MODIFY_APP",
  "FIX_APP",
  "EXPLAIN_APP",
  "APP_OPERATION",
  "GENERAL_CHAT",
  "UNSUPPORTED",
]);

export const intentResultSchema = z.object({
  intent: appIntentSchema,
  confidence: z.number().min(0).max(1),
  requiresClarification: z.boolean(),
  reason: z.string().min(1),
  requestedCapabilities: z.array(z.string()).default([]),
});

export const requirementSpecSchema = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  actors: z.array(z.string()).min(1),
  workflows: z.array(z.string()).min(1),
  entities: z.array(z.string()).default([]),
  businessRules: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1),
  confirmed: z.boolean(),
});

export const operationContractSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.-]{2,80}$/),
  method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
  path: z.string().startsWith("/api/"),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
});

export const appBlueprintSchema = z.object({
  blueprintVersion: z.literal(1),
  runtimeType: z.enum(["STATIC", "GO"]).default("GO"),
  product: z.object({
    name: z.string().min(1),
    goal: z.string().min(1),
    actors: z.array(z.string()).min(1),
    workflows: z.array(z.string()).min(1),
    acceptanceCriteria: z.array(z.string()).min(1),
  }),
  pages: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    route: z.string().startsWith("/"),
    operations: z.array(z.string()).default([]),
  })),
  entities: z.array(z.object({
    id: z.string().min(1),
    table: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/),
    description: z.string().min(1),
    fields: z.array(z.object({
      name: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
      type: z.enum(["string", "integer", "number", "boolean", "date", "datetime", "uuid", "json"]),
      required: z.boolean(),
    })).min(1),
  })),
  operations: z.array(operationContractSchema),
  businessRules: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    enforcedBy: z.enum(["backend", "database"]),
  })).default([]),
  dataEvolution: z.array(z.string()).default([]),
  testScenarios: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    expected: z.string().min(1),
  })).default([]),
});

export const runtimeManifestSchema = z.object({
  runtimeVersion: z.string().regex(/^go-\d+\.\d+$/),
  frontendEntry: z.string().default("frontend/App.tsx"),
  migrationDirectory: z.string().default("migrations"),
  operations: z.array(operationContractSchema),
  seedData: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
});

export const acceptanceScenarioSuiteSchema = z.object({
  scenarios: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9_.-]{2,80}$/),
    description: z.string().min(1),
    steps: z.array(z.object({
      operationId: z.string().regex(/^[a-z][a-z0-9_.-]{2,80}$/),
      input: z.record(z.string(), z.unknown()).default({}),
      expectStatus: z.number().int().min(100).max(599).default(200),
      assertions: z.array(z.object({
        path: z.string().min(1),
        operator: z.enum(["equals", "gte", "lte", "nonEmpty"]),
        value: z.unknown().optional(),
      })).default([]),
    })).min(1),
  })).min(1),
});

export type IntentResult = z.infer<typeof intentResultSchema>;
export type RequirementSpec = z.infer<typeof requirementSpecSchema>;
export type OperationContract = z.infer<typeof operationContractSchema>;
export type AppBlueprint = z.infer<typeof appBlueprintSchema>;
export type RuntimeManifest = z.infer<typeof runtimeManifestSchema>;
export type AcceptanceScenarioSuite = z.infer<typeof acceptanceScenarioSuiteSchema>;

export const CURRENT_GO_RUNTIME = "go-1.24" as const;
