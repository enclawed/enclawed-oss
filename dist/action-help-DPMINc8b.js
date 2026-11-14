import { n as buildSubagentsHelp, p as stopWithText } from "./shared-BkyEvCdb.js";
//#region src/auto-reply/reply/commands-subagents/action-help.ts
function handleSubagentsHelpAction() {
	return stopWithText(buildSubagentsHelp());
}
//#endregion
export { handleSubagentsHelpAction };
