import type { BlockParams } from 'ethers';
import type { Logger } from 'logger-chain';
import { filterSet, rangeSet, subscribeSet, traceSet, whitelistedSet } from './whitelisted.js';
import { BackendConfig } from './config.js';
import { hashOrigin } from './utils.js';

export interface JsonRpcReq {
    jsonrpc: string;
    id: string | number;
    method: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any;
}

export interface JsonRpcResp {
    jsonrpc: string;
    id: string | number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error?: any | { code: number; message: string; data?: any };
}

export function markNewError(code = -32603, message = 'Internal error'): JsonRpcResp | JsonRpcResp[] {
    return markError({ jsonrpc: '2.0', id: 0, method: '' }, code, message);
}

export function markError(
    reqs: JsonRpcReq | JsonRpcReq[],
    code = -32603,
    message = 'Internal error',
): JsonRpcResp | JsonRpcResp[] {
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

export function rewriteTag(blockTag: string | number | undefined, lastKnownBlock: number): number {
    if (typeof blockTag === 'number') {
        return blockTag;
    } else if (typeof blockTag === 'undefined') {
        return 0;
    } else if (blockTag === 'earliest') {
        return 0;
    } else if (blockTag === 'latest') {
        return lastKnownBlock;
    } else if (blockTag === 'pending') {
        return lastKnownBlock;
    } else if (blockTag === 'finalized') {
        return lastKnownBlock;
    } else if (blockTag === 'safe') {
        return lastKnownBlock;
    }
    return Number(blockTag);
}

export interface GetLogParam {
    fromBlock?: string | number;
    toBlock?: string | number;
    address?: string;
    blockHash?: string;
}

export function filterGetLogParam(
    maxBlockRange: number,
    param: GetLogParam[],
    lastKnownBlock: number,
): boolean {
    return (
        param.filter((p) => {
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
        }).length === 0
    );
}

export async function filterGetLogs(
    request: BasicRequest,
    reqs: JsonRpcReq | JsonRpcReq[],
): Promise<boolean> {
    if (!request.maxBlockRange) {
        return true;
    }

    const lastBlockNumber = await request.getSavedBlockNumber();

    if (!lastBlockNumber) {
        return true;
    }

    if (Array.isArray(reqs)) {
        return (
            reqs.filter((r) => {
                if (r.method === 'eth_getLogs' || r.method === 'eth_newFilter') {
                    if (
                        !filterGetLogParam(
                            request.maxBlockRange as number,
                            r.params as GetLogParam[],
                            lastBlockNumber,
                        )
                    ) {
                        return true;
                    }
                }
                return false;
            }).length === 0
        );
    }

    return filterGetLogParam(request.maxBlockRange, reqs.params as GetLogParam[], lastBlockNumber);
}

export async function filterRequest(
    request: BasicRequest,
    reqs: JsonRpcReq | JsonRpcReq[],
): Promise<JsonRpcResp | JsonRpcResp[]> {
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
            if (
                uniqueMethods.filter(
                    (method) =>
                        !(subscribeSet.has(method) && supportSubscribe) &&
                        !(traceSet.has(method) && backend.trace) &&
                        !(filterSet.has(method) && backend.filter) &&
                        !whitelistedSet.has(method),
                ).length
            ) {
                logger?.debug(
                    'FILTER',
                    `${origin}: ${reqs.length} reqs filtered ( ${uniqueMethods.join(', ')} )`,
                );

                return markError(reqs, -32601, 'Request contains unsupported method');
            }

            // (Batch) Make sure it has valid eth_getLog params
            if (uniqueMethods.filter((method) => rangeSet.has(method)).length) {
                if (!(await filterGetLogs(request, reqs))) {
                    logger?.debug(
                        'FILTER',
                        `${origin}: ${reqs.length} reqs filtered with invalid eth_getLogs params`,
                    );

                    return markError(reqs, -32601, 'Request contains invalid block params');
                }
            }

            logger?.debug('PROXY', `${origin}: ${reqs.length} reqs ( ${uniqueMethods.join(', ')} )`);

            return (await request.sendUpstream(reqs)) as JsonRpcResp[];
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
        if (
            !(subscribeSet.has(reqs.method) && supportSubscribe) &&
            !(traceSet.has(reqs.method) && backend.trace) &&
            !(filterSet.has(reqs.method) && backend.filter) &&
            !whitelistedSet.has(reqs.method)
        ) {
            logger?.debug('FILTER', `${origin}: request filtered with ${reqs.method} method`);

            return markError(reqs, -32601, 'Request contains unsupported method');
        }

        // (Request) Make sure it has valid eth_getLog params
        if (rangeSet.has(reqs.method)) {
            if (!(await filterGetLogs(request, reqs))) {
                logger?.debug('FILTER', `${origin}: request filtered with invalid eth_getLogs params`);

                return markError(reqs, -32601, 'Request contains invalid block params');
            }
        }

        logger?.debug('PROXY', `${origin}: ${reqs.method}`);

        return (await request.sendUpstream(reqs)) as JsonRpcResp;
    } catch {
        logger?.debug('FILTER', `${origin}: Unknown filter error`);
        return markNewError(-32603, 'Unknown filter error');
    }
}

export type GetRateLimitFunc = (origin: string, count: number) => Promise<boolean>;

export type GetBlockNumberFunc = (chain: string) => Promise<number>;

export interface BasicRequestParams {
    maxBlockRange?: number;
    backend: BackendConfig;
    origin?: string;
    rateLimit?: GetRateLimitFunc;
    blockFunc?: GetBlockNumberFunc;
    logger?: Logger;
}

export class BasicRequest {
    maxBlockRange?: number;
    backend: BackendConfig;
    hOrigin: Promise<string>;
    rateLimit?: GetRateLimitFunc;
    blockFunc?: GetBlockNumberFunc;
    logger?: Logger;

    supportSubscribe: boolean;

    constructor({ maxBlockRange, backend, origin, rateLimit, blockFunc, logger }: BasicRequestParams) {
        this.maxBlockRange = maxBlockRange;
        this.backend = backend;
        this.hOrigin = origin ? hashOrigin(origin) : new Promise((resolve) => resolve(''));
        this.rateLimit = rateLimit;
        this.blockFunc = blockFunc;
        this.logger = logger;

        this.supportSubscribe = false;
    }

    async send(reqs: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]> {
        return filterRequest(this, reqs);
    }

    async sendUpstream(reqs: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]> {
        return filterRequest(this, reqs);
    }

    async getBlockNumber(): Promise<number> {
        const { result, error } = (await this.sendUpstream({
            jsonrpc: '2.0',
            id: 0,
            method: 'eth_blockNumber',
        })) as JsonRpcResp;

        if (error) {
            throw new Error(JSON.stringify(error));
        }

        return Number(result as string);
    }

    async getSavedBlockNumber(): Promise<number> {
        return this.blockFunc ? await this.blockFunc(this.backend.chain) : 0;
    }

    async getBlock(): Promise<BlockParams> {
        const { result, error } = (await this.sendUpstream({
            jsonrpc: '2.0',
            id: 0,
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
        })) as JsonRpcResp;

        if (error) {
            throw new Error(JSON.stringify(error));
        }

        return result as BlockParams;
    }
}
