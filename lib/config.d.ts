import type { logLevel } from '@cpuchain/logger';
export interface BackendConfig {
    chain: string;
    url: string;
    wsUrl?: string;
    trace?: boolean;
    filter?: boolean;
    timeout: number;
}
export interface Config {
    host: string;
    port: number;
    workers: number;
    logLevel: logLevel;
    reverseProxy: boolean;
    swaggerApi?: string;
    redirect?: string;
    healthyAge: number;
    /**
     * Rate limits
     */
    interval: number;
    ratelimit: number;
    concurrency: number;
    maxBodySize: number;
    /**
     * Block range (eth_getLogs)
     */
    blockRefresh?: number;
    maxBlockRange?: number;
    backends: BackendConfig[];
    backendGroup: Record<string, BackendConfig[]>;
}
export declare const configSchema: {
    readonly type: "object";
    readonly properties: {
        readonly host: {
            readonly type: "string";
        };
        readonly port: {
            readonly type: "number";
        };
        readonly workers: {
            readonly type: "number";
        };
        readonly logLevel: {
            readonly type: "string";
        };
        readonly reverseProxy: {
            readonly type: "boolean";
        };
        readonly swaggerApi: {
            readonly type: "string";
        };
        readonly redirect: {
            readonly type: "string";
        };
        readonly healthyAge: {
            readonly type: "number";
        };
        readonly interval: {
            readonly type: "number";
        };
        readonly ratelimit: {
            readonly type: "number";
        };
        readonly concurrency: {
            readonly type: "number";
        };
        readonly maxBodySize: {
            readonly type: "number";
        };
        readonly blockRefresh: {
            readonly type: "number";
        };
        readonly maxBlockRange: {
            readonly type: "number";
        };
        readonly backends: {
            readonly type: "array";
            readonly minItems: 1;
            readonly items: {
                readonly type: "object";
                readonly properties: {
                    readonly chain: {
                        readonly type: "string";
                    };
                    readonly url: {
                        readonly type: "string";
                    };
                    readonly wsUrl: {
                        readonly type: "string";
                    };
                    readonly trace: {
                        readonly type: "boolean";
                    };
                    readonly filter: {
                        readonly type: "boolean";
                    };
                    readonly timeout: {
                        readonly type: "number";
                    };
                };
                readonly required: readonly ["chain", "url"];
            };
        };
    };
    readonly required: readonly ["backends"];
};
export declare function getConfig(): Config;
