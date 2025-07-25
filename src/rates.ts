import { Logger } from 'logger-chain';
import type { Config } from './config.js';

export class RateLimiter {
    config: Config;

    logger: Logger;

    // Counter for rate limits (reset on every configured interval)
    counts: Record<string, number>;
    allCounts: number;
    allLimits: number;

    // Counter for sessions (ws) (reset on every day)
    sessions: Record<string, Set<string>>;

    constructor(config: Config) {
        this.config = config;

        this.logger = new Logger(config);

        this.counts = {};
        this.allCounts = 0;
        this.allLimits = 0;
        this.sessions = {};

        // Resets counts per interval (default to 60 sec)
        setInterval(() => {
            this.logger.info(
                'PROXY',
                `Reqs: ${this.allCounts} ( ${Math.floor(this.allCounts / config.interval)} req/s ), ` +
                    `Limits: ${this.allLimits}, ` +
                    `Users: ${Object.keys(this.counts).length}, ` +
                    `Conns: ${Object.keys(this.sessions).length}`,
            );
            this.counts = {};
            this.allCounts = 0;
            this.allLimits = 0;
        }, config.interval * 1000);

        setInterval(() => {
            this.sessions = {};
        }, 86400 * 1000);
    }

    addCount(key: string, count = 1): boolean {
        if (!this.counts[key]) {
            this.counts[key] = 0;
        }

        this.counts[key] += count;
        this.allCounts += count;

        if (this.counts[key] > this.config.ratelimit) {
            this.allLimits += count;
            return false;
        }

        return true;
    }

    addSession(key: string, session: string): boolean {
        if (!this.sessions[key]) {
            this.sessions[key] = new Set();
        }

        if (!this.sessions[key].has(session)) {
            this.sessions[key].add(session);
        }

        if (this.sessions[key].size > this.config.concurrency) {
            return false;
        }

        return true;
    }

    removeSession(key: string, session: string): boolean {
        if (this.sessions[key]?.has(session)) {
            this.sessions[key].delete(session);
        }
        if (!this.sessions[key]?.size) {
            delete this.sessions[key];
        }
        return true;
    }
}
