"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
const logger_1 = require("@cpuchain/logger");
class RateLimiter {
    config;
    logger;
    // Counter for rate limits (reset on every configured interval)
    counts;
    allCounts;
    allLimits;
    // Counter for sessions (ws) (reset on every day)
    sessions;
    constructor(config) {
        this.config = config;
        this.logger = (0, logger_1.factory)(config);
        this.counts = {};
        this.allCounts = 0;
        this.allLimits = 0;
        this.sessions = {};
        // Resets counts per interval (default to 60 sec)
        setInterval(() => {
            this.logger.info('PROXY', `Reqs: ${this.allCounts} ( ${Math.floor(this.allCounts / config.interval)} req/s ), ` +
                `Limits: ${this.allLimits}, ` +
                `Users: ${Object.keys(this.counts).length}, ` +
                `Conns: ${Object.keys(this.sessions).length}`);
            this.counts = {};
            this.allCounts = 0;
            this.allLimits = 0;
        }, config.interval * 1000);
        setInterval(() => {
            this.sessions = {};
        }, 86400 * 1000);
    }
    addCount(key, count = 1) {
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
    addSession(key, session) {
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
    removeSession(key, session) {
        if (this.sessions[key]?.has(session)) {
            this.sessions[key].delete(session);
        }
        if (!this.sessions[key]?.size) {
            delete this.sessions[key];
        }
        return true;
    }
}
exports.RateLimiter = RateLimiter;
