#!/usr/bin/env node
import process from 'process';
import cluster from 'cluster';

import { Logger } from 'logger-chain';
import { Config, getConfig } from './config.js';

import { MsgAddCount, MsgBlockNumber, MsgRequest, MsgSession, Proxy } from './proxy.js';
import { RateLimiter } from './rates.js';
import { LastBlocks } from './lastBlocks.js';

if (cluster.isWorker) {
    const config = JSON.parse(process.env.config as string) as Config;
    const forkId = Number(process.env.forkId);

    switch (process.env.workerType) {
        case 'proxy':
            new Proxy(config, forkId);
            break;
    }
} else if (cluster.isPrimary) {
    start();
}

function createServerWorker(
    config: Config,
    logger: Logger,
    lastBlock: LastBlocks,
    rateLimiter: RateLimiter,
    forkId: number,
) {
    const worker = cluster.fork({
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
        .on('message', (msg: MsgRequest) => {
            if (msg.type === 'addCount') {
                const { id, key, score } = msg as MsgAddCount;
                worker.send({
                    id,
                    result: rateLimiter.addCount(key, score),
                });
            } else if (msg.type === 'addSession') {
                const { id, key, session } = msg as MsgSession;
                worker.send({
                    id,
                    result: rateLimiter.addSession(key, session),
                });
            } else if (msg.type === 'removeSession') {
                const { id, key, session } = msg as MsgSession;
                worker.send({
                    id,
                    result: rateLimiter.removeSession(key, session),
                });
            } else if (msg.type === 'getBlockNumber') {
                const { id, chain } = msg as MsgBlockNumber;
                worker.send({
                    id,
                    result: lastBlock.blocks[chain],
                });
            }
        });
}

async function start() {
    const config = getConfig();
    const logger = new Logger(config);
    const lastBlock = new LastBlocks(config);
    const rateLimiter = new RateLimiter(config);

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
