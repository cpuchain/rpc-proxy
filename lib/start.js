"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const process_1 = __importDefault(require("process"));
const cluster_1 = __importDefault(require("cluster"));
const logger_1 = require("@cpuchain/logger");
const config_1 = require("./config");
const proxy_1 = require("./proxy");
const rates_1 = require("./rates");
const lastBlocks_1 = require("./lastBlocks");
if (cluster_1.default.isWorker) {
    const config = JSON.parse(process_1.default.env.config);
    const forkId = Number(process_1.default.env.forkId);
    switch (process_1.default.env.workerType) {
        case 'proxy':
            new proxy_1.Proxy(config, forkId);
            break;
    }
}
else if (cluster_1.default.isPrimary) {
    start();
}
function createServerWorker(config, logger, lastBlock, rateLimiter, forkId) {
    const worker = cluster_1.default.fork({
        workerType: 'proxy',
        forkId,
        config: JSON.stringify(config),
    });
    worker
        .on('exit', (code) => {
        logger.debug('WORKER', `Worker ${forkId} exit with ${code}, spawning replacement...`);
        setTimeout(() => {
            createServerWorker(config, logger, lastBlock, rateLimiter, forkId);
        }, 2000);
    })
        .on('message', (msg) => {
        if (msg.type === 'addCount') {
            const { id, key, score } = msg;
            worker.send({
                id,
                result: rateLimiter.addCount(key, score),
            });
        }
        else if (msg.type === 'addSession') {
            const { id, key, session } = msg;
            worker.send({
                id,
                result: rateLimiter.addSession(key, session),
            });
        }
        else if (msg.type === 'removeSession') {
            const { id, key, session } = msg;
            worker.send({
                id,
                result: rateLimiter.removeSession(key, session),
            });
        }
        else if (msg.type === 'getBlockNumber') {
            const { id, chain } = msg;
            worker.send({
                id,
                result: lastBlock.blocks[chain],
            });
        }
    });
}
async function start() {
    const config = (0, config_1.getConfig)();
    const logger = (0, logger_1.factory)(config);
    const lastBlock = new lastBlocks_1.LastBlocks(config);
    const rateLimiter = new rates_1.RateLimiter(config);
    console.log(config);
    await lastBlock.blocksPromise;
    console.log(lastBlock.blocks);
    // Start workers
    let i = 0;
    while (i < config.workers) {
        createServerWorker(config, logger, lastBlock, rateLimiter, i);
        ++i;
    }
    logger.debug('SPAWNER', `Spawned ${i} website workers`);
}
