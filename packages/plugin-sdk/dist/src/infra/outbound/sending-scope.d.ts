/** True inside a delivery whose payload already ran the outbound sending hooks. */
export declare function isOutboundSendMediated(): boolean;
/** Run `fn` as a delivery whose payload already ran the outbound sending hooks. */
export declare function runAsMediatedOutboundSend<T>(fn: () => T): T;
