import type { IncomingMessage, ServerResponse } from "node:http";
export declare const A2UI_PATH = "/__enclawed__/a2ui";
export declare const CANVAS_HOST_PATH = "/__enclawed__/canvas";
export declare const CANVAS_WS_PATH = "/__enclawed__/ws";
export declare function injectCanvasLiveReload(html: string): string;
export declare function handleA2uiHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
