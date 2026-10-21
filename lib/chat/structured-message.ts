export type StructuredMessageKind = "requirement" | "blueprint";

export interface StructuredMessagePayload {
  kind: StructuredMessageKind;
  data: Record<string, unknown>;
  before: string;
  after: string;
}

function parseTaggedJson(content: string, tag: string) {
  const match = content.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  if (!match) return undefined;

  const jsonText = match[1]
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    const data = JSON.parse(jsonText);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return undefined;
    }
    const start = match.index || 0;
    return {
      data: data as Record<string, unknown>,
      before: content.slice(0, start).trim(),
      after: content.slice(start + match[0].length).trim(),
    };
  } catch {
    return undefined;
  }
}

export function parseStructuredMessage(
  content: string,
): StructuredMessagePayload | undefined {
  const requirement = parseTaggedJson(content, "requirementSpec");
  if (requirement) return { kind: "requirement", ...requirement };

  const blueprint = parseTaggedJson(content, "appBlueprint");
  if (blueprint) return { kind: "blueprint", ...blueprint };

  return undefined;
}

export function detectStructuredMessageKind(
  content: string,
): StructuredMessageKind | undefined {
  if (/<requirementSpec(?:\s|>)/i.test(content)) return "requirement";
  if (/<appBlueprint(?:\s|>)/i.test(content)) return "blueprint";
  return undefined;
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return String(
          record.title ||
            record.name ||
            record.description ||
            record.id ||
            "",
        );
      }
      return "";
    })
    .filter(Boolean);
}

export function objectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
