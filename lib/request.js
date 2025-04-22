"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicRequest = void 0;
exports.markNewError = markNewError;
exports.markError = markError;
exports.rewriteTag = rewriteTag;
exports.filterGetLogParam = filterGetLogParam;
exports.filterGetLogs = filterGetLogs;
exports.filterRequest = filterRequest;
const whitelisted_1 = require("./whitelisted");
const utils_1 = require("./utils");
function markNewError(code = -32603, message = 'Internal error') {
    return markError({ jsonrpc: '2.0', id: 0, method: '' }, code, message);
}
function markError(reqs, code = -32603, message = 'Internal error') {
    if (Array.isArray(reqs)) {
        return reqs.map((req) => ({
            jsonrpc: req.jsonrpc,
            id: req.id,
            error: {
                code,
                message,
            },
        }));
    }
    return {
        jsonrpc: reqs.jsonrpc,
        id: reqs.id,
        error: {
            code,
            message,
        },
    };
}
function rewriteTag(blockTag, lastKnownBlock) {
    if (typeof blockTag === 'number') {
        return blockTag;
    }
    else if (typeof blockTag === 'undefined') {
        return 0;
    }
    else if (blockTag === 'earliest') {
        return 0;
    }
    else if (blockTag === 'latest') {
        return lastKnownBlock;
    }
    else if (blockTag === 'pending') {
        return lastKnownBlock;
    }
    else if (blockTag === 'finalized') {
        return lastKnownBlock;
    }
    else if (blockTag === 'safe') {
        return lastKnownBlock;
    }
    return Number(blockTag);
}
function filterGetLogParam(maxBlockRange, param, lastKnownBlock) {
    return (param.filter((p) => {
        if (p.blockHash) {
            return false;
        }
        const [fromBlock, toBlock] = [
            rewriteTag(p.fromBlock, lastKnownBlock),
            rewriteTag(p.toBlock, lastKnownBlock),
        ];
        if (toBlock - fromBlock > maxBlockRange) {
            return true;
        }
        return false;
    }).length === 0);
}
async function filterGetLogs(request, reqs) {
    if (!request.maxBlockRange) {
        return true;
    }
    const lastBlockNumber = await request.getSavedBlockNumber();
    if (!lastBlockNumber) {
        return true;
    }
    if (Array.isArray(reqs)) {
        return (reqs.filter((r) => {
            if (r.method === 'eth_getLogs' || r.method === 'eth_newFilter') {
                if (!filterGetLogParam(request.maxBlockRange, r.params, lastBlockNumber)) {
                    return true;
                }
            }
            return false;
        }).length === 0);
    }
    return filterGetLogParam(request.maxBlockRange, reqs.params, lastBlockNumber);
}
async function filterRequest(request, reqs) {
    const { hOrigin, logger, supportSubscribe, backend } = request;
    const origin = await hOrigin;
    try {
        /**
         * Filter Batch Requests
         */
        if (Array.isArray(reqs)) {
            // (Batch) Make sure it has unique ids
            const uniqueIds = [...new Set(reqs.map((r) => r.id))];
            const uniqueMethods = [...new Set(reqs.map((r) => r.method))];
            if (uniqueIds.length !== reqs.length) {
                logger?.debug('FILTER', `${origin}: ${reqs.length} reqs filtered with id`);
                return markError(reqs, -32601, 'Batch should have unique ids');
            }
            // (Batch) Check for rate limit
            if (origin && request.rateLimit) {
                if (!(await request.rateLimit(origin, reqs.length))) {
                    logger?.debug('LIMITED', `${origin}: Rate limited`);
                    return markError(reqs, -32029, 'Rate limited');
                }
            }
            // (Batch) Make sure the method is whitelisted
            if (uniqueMethods.filter((method) => !(whitelisted_1.subscribeSet.has(method) && supportSubscribe) &&
                !(whitelisted_1.traceSet.has(method) && backend.trace) &&
                !(whitelisted_1.filterSet.has(method) && backend.filter) &&
                !whitelisted_1.whitelistedSet.has(method)).length) {
                logger?.debug('FILTER', `${origin}: ${reqs.length} reqs filtered ( ${uniqueMethods.join(', ')} )`);
                return markError(reqs, -32601, 'Request contains unsupported method');
            }
            // (Batch) Make sure it has valid eth_getLog params
            if (uniqueMethods.filter((method) => whitelisted_1.rangeSet.has(method)).length) {
                if (!(await filterGetLogs(request, reqs))) {
                    logger?.debug('FILTER', `${origin}: ${reqs.length} reqs filtered with invalid eth_getLogs params`);
                    return markError(reqs, -32601, 'Request contains invalid block params');
                }
            }
            logger?.debug('PROXY', `${origin}: ${reqs.length} reqs ( ${uniqueMethods.join(', ')} )`);
            return (await request.sendUpstream(reqs));
        }
        /**
         * Filter Single Request
         */
        // (Request) Check for rate limit
        if (origin && request.rateLimit) {
            if (!(await request.rateLimit(origin, 1))) {
                logger?.debug('LIMITED', `${origin}: Rate limited`);
                return markError(reqs, -32029, 'Rate limited');
            }
        }
        // (Request) Make sure the method is whitelisted
        if (!(whitelisted_1.subscribeSet.has(reqs.method) && supportSubscribe) &&
            !(whitelisted_1.traceSet.has(reqs.method) && backend.trace) &&
            !(whitelisted_1.filterSet.has(reqs.method) && backend.filter) &&
            !whitelisted_1.whitelistedSet.has(reqs.method)) {
            logger?.debug('FILTER', `${origin}: request filtered with ${reqs.method} method`);
            return markError(reqs, -32601, 'Request contains unsupported method');
        }
        // (Request) Make sure it has valid eth_getLog params
        if (whitelisted_1.rangeSet.has(reqs.method)) {
            if (!(await filterGetLogs(request, reqs))) {
                logger?.debug('FILTER', `${origin}: request filtered with invalid eth_getLogs params`);
                return markError(reqs, -32601, 'Request contains invalid block params');
            }
        }
        logger?.debug('PROXY', `${origin}: ${reqs.method}`);
        return (await request.sendUpstream(reqs));
    }
    catch {
        logger?.debug('FILTER', `${origin}: Unknown filter error`);
        return markNewError(-32603, 'Unknown filter error');
    }
}
class BasicRequest {
    maxBlockRange;
    backend;
    hOrigin;
    rateLimit;
    blockFunc;
    logger;
    supportSubscribe;
    constructor({ maxBlockRange, backend, origin, rateLimit, blockFunc, logger }) {
        this.maxBlockRange = maxBlockRange;
        this.backend = backend;
        this.hOrigin = origin ? (0, utils_1.hashOrigin)(origin) : new Promise((resolve) => resolve(''));
        this.rateLimit = rateLimit;
        this.blockFunc = blockFunc;
        this.logger = logger;
        this.supportSubscribe = false;
    }
    async send(reqs) {
        return filterRequest(this, reqs);
    }
    async sendUpstream(reqs) {
        return filterRequest(this, reqs);
    }
    async getBlockNumber() {
        const { result, error } = (await this.sendUpstream({
            jsonrpc: '2.0',
            id: 0,
            method: 'eth_blockNumber',
        }));
        if (error) {
            throw new Error(JSON.stringify(error));
        }
        return Number(result);
    }
    async getSavedBlockNumber() {
        return this.blockFunc ? await this.blockFunc(this.backend.chain) : 0;
    }
    async getBlock() {
        const { result, error } = (await this.sendUpstream({
            jsonrpc: '2.0',
            id: 0,
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
        }));
        if (error) {
            throw new Error(JSON.stringify(error));
        }
        return result;
    }
}
exports.BasicRequest = BasicRequest;
