import type { BlockParams } from 'ethers';
import type { Logger } from '@cpuchain/logger';
import { BackendConfig } from './config';
export interface JsonRpcReq {
    jsonrpc: string;
    id: string | number;
    method: string;
    params?: any;
}
export interface JsonRpcResp {
    jsonrpc: string;
    id: string | number;
    result?: any;
    error?: any | {
        code: number;
        message: string;
        data?: any;
    };
}
export declare function markNewError(code?: number, message?: string): JsonRpcResp | JsonRpcResp[];
export declare function markError(reqs: JsonRpcReq | JsonRpcReq[], code?: number, message?: string): JsonRpcResp | JsonRpcResp[];
export declare function rewriteTag(blockTag: string | number | undefined, lastKnownBlock: number): number;
export interface GetLogParam {
    fromBlock?: string | number;
    toBlock?: string | number;
    address?: string;
    blockHash?: string;
}
export declare function filterGetLogParam(maxBlockRange: number, param: GetLogParam[], lastKnownBlock: number): boolean;
export declare function filterGetLogs(request: BasicRequest, reqs: JsonRpcReq | JsonRpcReq[]): Promise<boolean>;
export declare function filterRequest(request: BasicRequest, reqs: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
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
export declare class BasicRequest {
    maxBlockRange?: number;
    backend: BackendConfig;
    hOrigin: Promise<string>;
    rateLimit?: GetRateLimitFunc;
    blockFunc?: GetBlockNumberFunc;
    logger?: Logger;
    supportSubscribe: boolean;
    constructor({ maxBlockRange, backend, origin, rateLimit, blockFunc, logger }: BasicRequestParams);
    send(reqs: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
    sendUpstream(reqs: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
    getBlockNumber(): Promise<number>;
    getSavedBlockNumber(): Promise<number>;
    getBlock(): Promise<BlockParams>;
}
