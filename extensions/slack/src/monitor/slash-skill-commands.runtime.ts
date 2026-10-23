import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "@enclawed/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("@enclawed/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
