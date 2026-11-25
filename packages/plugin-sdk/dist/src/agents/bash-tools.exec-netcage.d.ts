import { type NetCageAlert } from "../enclawed/netcage/alert.js";
import { type NetCageSupport } from "../enclawed/netcage/cage.js";
export type ExecNetCage = {
    wrapArgv(argv: string[], cwd?: string): {
        argv: string[];
        env: Record<string, string>;
    };
    wrapPtyCommand(shell: string, shellArgs: string[], command: string): {
        ptyCommand: string;
        env: Record<string, string>;
    };
    /**
     * Wait for the last reports and close the cage's host side. Returns one
     * line per destination tried more than once, with its count.
     */
    finish(): Promise<string[]>;
};
export declare class ExecNetworkRefusedError extends Error {
    name: string;
}
export declare function prepareExecNetCage(params: {
    command: string;
    onAlert: (alert: NetCageAlert) => void;
}, deps?: {
    support: () => NetCageSupport;
}): Promise<ExecNetCage | null>;
