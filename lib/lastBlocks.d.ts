import type { BackendConfig, Config } from './config';
export declare function refreshBlocks(lastBlocks: LastBlocks, backendGroup: Record<string, BackendConfig[]>): Promise<void>;
export declare class LastBlocks {
    blocks: Record<string, number>;
    blocksPromise?: Promise<void>;
    constructor(config: Config);
}
