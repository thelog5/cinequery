/**
 * The four agent versions from the PRD. Each version is a strict superset of
 * the previous one so the eval results isolate one change at a time.
 *
 *   v1  list_tables, describe_table (names + types), run_query
 *   v2  describe_table adds column comments and 3 sample rows
 *   v3  adds search_people and search_titles
 *   v4  adds 3 worked examples to the system prompt
 */

export type AgentVersionId = "v1" | "v2" | "v3" | "v4";

export interface AgentVersion {
  id: AgentVersionId;
  change: string;
  /** describe_table returns comments + sample rows */
  richDescribe: boolean;
  /** search_people / search_titles are registered */
  searchTools: boolean;
  /** system prompt includes worked examples */
  workedExamples: boolean;
}

export const AGENT_VERSIONS: Record<AgentVersionId, AgentVersion> = {
  v1: {
    id: "v1",
    change: "list_tables, describe_table, run_query only",
    richDescribe: false,
    searchTools: false,
    workedExamples: false,
  },
  v2: {
    id: "v2",
    change: "Column comments and sample rows in describe_table",
    richDescribe: true,
    searchTools: false,
    workedExamples: false,
  },
  v3: {
    id: "v3",
    change: "Add search_people and search_titles",
    richDescribe: true,
    searchTools: true,
    workedExamples: false,
  },
  v4: {
    id: "v4",
    change: "3 worked examples in the system prompt",
    richDescribe: true,
    searchTools: true,
    workedExamples: true,
  },
};

/** The version the public demo runs. */
export const LATEST_VERSION: AgentVersionId = "v4";

export function getVersion(id: string | undefined): AgentVersion {
  const key = (id ?? LATEST_VERSION) as AgentVersionId;
  const v = AGENT_VERSIONS[key];
  if (!v) {
    throw new Error(`Unknown agent version "${id}". Use one of ${Object.keys(AGENT_VERSIONS).join(", ")}.`);
  }
  return v;
}
