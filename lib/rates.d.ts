import { Logger } from '@cpuchain/logger';
import type { Config } from './config';
export declare class RateLimiter {
    config: Config;
    logger: Logger;
    counts: Record<string, number>;
    allCounts: number;
    allLimits: number;
    sessions: Record<string, Set<string>>;
    constructor(config: Config);
    addCount(key: string, count?: number): boolean;
    addSession(key: string, session: string): boolean;
    removeSession(key: string, session: string): boolean;
}
