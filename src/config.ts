import os from 'os';
import { existsSync, readFileSync } from 'fs';
import { Ajv } from 'ajv';
import type { LogLevel } from 'logger-chain';

export interface BackendConfig {
    // chain in string (used for router directory)
    chain: string;
    // HTTP endpoint of RPC endpoint (should be in full URL format)
    url: string;
    // (optional) WS endpoint of RPC endpoint (should be in full URL format)
    wsUrl?: string;
    // (optional) Boolean to allow trace_ RPC methods
    trace?: boolean;
    // (optional) Boolean to allow filter RPC methods
    filter?: boolean;
    // (optional) Timeout of sent backend request
    timeout: number;
}

export interface Config {
    host: string;
    port: number;
    workers: number;
    logLevel: LogLevel;
    reverseProxy: boolean;

    // Public endpoint to make access of swaggerApi
    swaggerApi?: string;

    // Redirect GET requests to specific webpage
    redirect?: string;

    // Block age to consider backend healthy
    healthyAge: number;

    /**
     * Rate limits
     */
    // (rate) Interval to measure and apply rate limits (Default to 60s)
    interval: number;
    // (rate) Number of requests to allow during interval (Default to 100 reqs)
    ratelimit: number;
    // (rate) Number of websocket connections to allow during interval (Default to 50 conns)
    concurrency: number;
    // (rate) Max POST / WS body size (Default to 10MB)
    maxBodySize: number;

    /**
     * Block range (eth_getLogs)
     */
    blockRefresh?: number;
    maxBlockRange?: number;

    backends: BackendConfig[];

    backendGroup: Record<string, BackendConfig[]>;
}

export const configSchema = {
    type: 'object',
    properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        workers: { type: 'number' },
        logLevel: { type: 'string' },
        reverseProxy: { type: 'boolean' },
        swaggerApi: { type: 'string' },

        redirect: { type: 'string' },

        healthyAge: { type: 'number' },

        interval: { type: 'number' },
        ratelimit: { type: 'number' },
        concurrency: { type: 'number' },
        maxBodySize: { type: 'number' },

        blockRefresh: { type: 'number' },
        maxBlockRange: { type: 'number' },

        backends: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                properties: {
                    chain: { type: 'string' },
                    url: { type: 'string' },
                    wsUrl: { type: 'string' },
                    trace: { type: 'boolean' },
                    filter: { type: 'boolean' },
                    timeout: { type: 'number' },
                },
                required: ['chain', 'url'],
            },
        },
    },
    required: ['backends'],
} as const;

export function getConfig(): Config {
    const configFile = process.env.CONFIG_FILE || 'config.json';

    if (!existsSync(configFile)) {
        throw new Error('Config file not found');
    }

    const config = JSON.parse(readFileSync(configFile, { encoding: 'utf8' })) as Config;

    const ajv = new Ajv();

    if (!ajv.compile(configSchema)(config)) {
        throw new Error('Invalid config, check the config.example.json and verify if config is valid');
    }

    config.host = config.host || '127.0.0.1';
    config.port = config.port || 8544;
    config.workers = config.workers || os.cpus().length;
    config.logLevel = config.logLevel || 'debug';
    config.reverseProxy = config.reverseProxy ?? true;

    config.healthyAge = config.healthyAge || 1800;

    config.interval = config.interval || 60;
    config.ratelimit = config.ratelimit || 100;
    config.concurrency = config.concurrency || 50;
    // Default to 10MB
    config.maxBodySize = config.maxBodySize || 10485760;

    for (const backend of config.backends) {
        backend.timeout = backend.timeout || 120;
    }

    config.backendGroup = config.backends.reduce(
        (acc, curr) => {
            if (!acc[curr.chain]) {
                acc[curr.chain] = [];
            }

            acc[curr.chain].push(curr);

            return acc;
        },
        {} as Record<string, BackendConfig[]>,
    );

    return config;
}
