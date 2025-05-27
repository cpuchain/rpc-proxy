"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = void 0;
exports.getConfig = getConfig;
const os_1 = __importDefault(require("os"));
const fs_1 = require("fs");
const ajv_1 = __importDefault(require("ajv"));
exports.configSchema = {
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
};
function getConfig() {
    const configFile = process.env.CONFIG_FILE || 'config.json';
    if (!(0, fs_1.existsSync)(configFile)) {
        throw new Error('Config file not found');
    }
    const config = JSON.parse((0, fs_1.readFileSync)(configFile, { encoding: 'utf8' }));
    const ajv = new ajv_1.default();
    if (!ajv.compile(exports.configSchema)(config)) {
        throw new Error('Invalid config, check the config.example.json and verify if config is valid');
    }
    config.host = config.host || '127.0.0.1';
    config.port = config.port || 8544;
    config.workers = config.workers || os_1.default.cpus().length;
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
    config.backendGroup = config.backends.reduce((acc, curr) => {
        if (!acc[curr.chain]) {
            acc[curr.chain] = [];
        }
        acc[curr.chain].push(curr);
        return acc;
    }, {});
    return config;
}
