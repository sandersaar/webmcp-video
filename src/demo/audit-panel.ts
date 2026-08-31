import type { AuditEntry } from "#video/adapter/types";

const visibleFields: readonly (keyof AuditEntry)[] = [
  "tool_id",
  "invocation_id",
  "page_mapping",
  "moment_ref",
  "rights_decision",
  "requested_second",
  "observed_second",
  "player_status",
  "safe_error_code",
];

export function createLocalAudit(container: HTMLElement): Readonly<{
  record(entry: AuditEntry): void;
  entries(): readonly AuditEntry[];
}> {
  const entries: AuditEntry[] = [];
  return {
    record(entry) {
      entries.push(structuredClone(entry));
      if (entries.length > 20) entries.shift();
      const heading = document.createElement("h2");
      heading.textContent = "Local demo audit";
      const note = document.createElement("p");
      note.textContent = "Local session evidence only. This is not a production audit record.";
      const list = document.createElement("dl");
      for (const field of visibleFields) {
        const term = document.createElement("dt");
        term.textContent = field;
        const value = document.createElement("dd");
        value.textContent = entry[field] === null ? "none" : String(entry[field]);
        list.append(term, value);
      }
      container.replaceChildren(heading, note, list);
    },
    entries: () => structuredClone(entries),
  };
}
