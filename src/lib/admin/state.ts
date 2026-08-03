import type { MatchupStatus, SeedLockStatus } from "@/lib/bracket/stateMachine";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function jsonFingerprint(value: unknown): string {
  return stableJson((value ?? null) as JsonValue);
}

export function canRenderMatchupSettleControl(status: MatchupStatus): boolean {
  return status === "provisional" || status === "under_review";
}

export function canRenderSeedLockSettleControl(status: SeedLockStatus): boolean {
  return status === "provisional" || status === "under_review";
}
