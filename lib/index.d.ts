import { ValidateFunction } from 'ajv';
import { BlockParams } from 'ethers';
import { FastifyInstance } from 'fastify';
import { LogLevel, Logger } from 'logger-chain';
import { WebSocket as WebSocket$1 } from 'ws';

export interface BackendConfig {
	chain: string;
	url: string;
	wsUrl?: string;
	trace?: boolean;
	filter?: boolean;
	timeout: number;
}
export interface Config {
	host: string;
	port: number;
	workers: number;
	logLevel: LogLevel;
	reverseProxy: boolean;
	swaggerApi?: string;
	redirect?: string;
	healthyAge: number;
	/**
	 * Rate limits
	 */
	interval: number;
	ratelimit: number;
	concurrency: number;
	maxBodySize: number;
	/**
	 * Block range (eth_getLogs)
	 */
	blockRefresh?: number;
	maxBlockRange?: number;
	backends: BackendConfig[];
	backendGroup: Record<string, BackendConfig[]>;
}
export declare const configSchema: {
	readonly type: "object";
	readonly properties: {
		readonly host: {
			readonly type: "string";
		};
		readonly port: {
			readonly type: "number";
		};
		readonly workers: {
			readonly type: "number";
		};
		readonly logLevel: {
			readonly type: "string";
		};
		readonly reverseProxy: {
			readonly type: "boolean";
		};
		readonly swaggerApi: {
			readonly type: "string";
		};
		readonly redirect: {
			readonly type: "string";
		};
		readonly healthyAge: {
			readonly type: "number";
		};
		readonly interval: {
			readonly type: "number";
		};
		readonly ratelimit: {
			readonly type: "number";
		};
		readonly concurrency: {
			readonly type: "number";
		};
		readonly maxBodySize: {
			readonly type: "number";
		};
		readonly blockRefresh: {
			readonly type: "number";
		};
		readonly maxBlockRange: {
			readonly type: "number";
		};
		readonly backends: {
			readonly type: "array";
			readonly minItems: 1;
			readonly items: {
				readonly type: "object";
				readonly properties: {
					readonly chain: {
						readonly type: "string";
					};
					readonly url: {
						readonly type: "string";
					};
					readonly wsUrl: {
						readonly type: "string";
					};
					readonly trace: {
						readonly type: "boolean";
					};
					readonly filter: {
						readonly type: "boolean";
					};
					readonly timeout: {
						readonly type: "number";
					};
				};
				readonly required: readonly [
					"chain",
					"url"
				];
			};
		};
	};
	readonly required: readonly [
		"backends"
	];
};
export declare function getConfig(): Config;
export declare function refreshBlocks(lastBlocks: LastBlocks, backendGroup: Record<string, BackendConfig[]>): Promise<void>;
export declare class LastBlocks {
	blocks: Record<string, number>;
	blocksPromise?: Promise<void>;
	constructor(config: Config);
}
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
export declare class PostRequest extends BasicRequest {
	sendUpstream(req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
}
export interface WSQueue {
	id: string;
	resolve: (msg: any) => void;
	reject: (err: Error) => void;
	timeout?: NodeJS.Timeout;
	resolved: boolean;
}
export declare function sendWS(request: WebSocketRequest, req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
export declare function connectWSRpc(request: WebSocketRequest): Promise<WebSocket>;
export type onDisconnect = () => void;
export type onSubscribe = (data: JsonRpcResp | JsonRpcResp[]) => void;
export declare class WebSocketRequest extends BasicRequest {
	wid: string;
	checked: boolean;
	ws?: Promise<WebSocket>;
	onDisconnect?: onDisconnect;
	onSubscribe?: onSubscribe;
	queue: WSQueue[];
	constructor(params: BasicRequestParams & {
		wid: string;
	});
	connect(): Promise<WebSocket>;
	terminate(): Promise<void>;
	sendUpstream(req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
}
declare const __dirname$1: string;
export declare const swaggerUiDir: string;
export type WebSocketWithRequest = WebSocket & {
	request: Promise<WebSocketRequest>;
};
export interface MsgAddCount {
	id: string;
	type: "addCount";
	key: string;
	score: number;
}
export interface MsgSession {
	id: string;
	type: "addSession" | "removeSession";
	key: string;
	session: string;
}
export interface MsgBlockNumber {
	id: string;
	type: "getBlockNumber";
	chain: string;
}
export type MsgRequest = MsgAddCount | MsgSession | MsgBlockNumber;
export interface MsgResult<T> {
	id: string;
	result: T;
}
export interface MsgQueue {
	id: string;
	resolve: (msg: any) => void;
	reject: (err: Error) => void;
	timeout?: NodeJS.Timeout;
	resolved: boolean;
}
export declare function initProxy(proxy: Proxy$1): Promise<void>;
declare class Proxy$1 {
	config: Config;
	logger: Logger;
	app: FastifyInstance;
	reqSchema: ValidateFunction<boolean>;
	forkId: number;
	sockets: Set<WebSocketWithRequest>;
	msgQueue: MsgQueue[];
	constructor(config: Config, forkId?: number);
}
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
export declare const JsonRpcReqSchema: {
	readonly oneOf: readonly [
		{
			readonly type: "array";
			readonly minItems: 1;
			readonly maxItems: 100;
			readonly items: {
				readonly type: "object";
				readonly properties: {
					readonly jsonrpc: {
						readonly type: "string";
					};
					readonly id: {
						readonly type: readonly [
							"string",
							"number"
						];
					};
					readonly method: {
						readonly type: "string";
					};
					readonly params: {};
				};
				readonly required: readonly [
					"jsonrpc",
					"id",
					"method"
				];
			};
		},
		{
			readonly type: "object";
			readonly properties: {
				readonly jsonrpc: {
					readonly type: "string";
				};
				readonly id: {
					readonly type: readonly [
						"string",
						"number"
					];
				};
				readonly method: {
					readonly type: "string";
				};
				readonly params: {};
			};
			readonly required: readonly [
				"jsonrpc",
				"id",
				"method"
			];
		}
	];
};
export declare const JsonRpcRespSchema: {
	readonly description: "JSONRPC 2.0 Response";
	readonly oneOf: readonly [
		{
			readonly type: "array";
			readonly minItems: 1;
			readonly maxItems: 100;
			readonly items: {
				readonly type: "object";
				readonly properties: {
					readonly jsonrpc: {
						readonly type: "string";
					};
					readonly id: {
						readonly type: readonly [
							"string",
							"number"
						];
					};
					readonly result: {};
					readonly error: {};
				};
				readonly required: readonly [
					"jsonrpc",
					"id"
				];
			};
		},
		{
			readonly type: "object";
			readonly properties: {
				readonly jsonrpc: {
					readonly type: "string";
				};
				readonly id: {
					readonly type: readonly [
						"string",
						"number"
					];
				};
				readonly result: {};
				readonly error: {};
			};
			readonly required: readonly [
				"jsonrpc",
				"id"
			];
		}
	];
};
export declare const BlockRespSchema: {
	readonly description: "Health Block Response";
	readonly type: "object";
	readonly properties: {
		readonly hash: {
			readonly type: "string";
		};
		readonly number: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly timestamp: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly parentHash: {
			readonly type: "string";
		};
		readonly parentBeaconBlockRoot: {
			readonly type: "string";
		};
		readonly nonce: {
			readonly type: "string";
		};
		readonly difficulty: {
			readonly type: "string";
		};
		readonly gasLimit: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly gasUsed: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly blobGasUsed: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly excessBlobGas: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly miner: {
			readonly type: "string";
		};
		readonly prevRandao: {
			readonly type: "string";
		};
		readonly extraData: {
			readonly type: "string";
		};
		readonly baseFeePerGas: {
			readonly type: readonly [
				"string",
				"number"
			];
		};
		readonly stateRoot: {
			readonly type: "string";
		};
		readonly receiptsRoot: {
			readonly type: "string";
		};
		readonly transactions: {
			readonly type: "array";
			readonly items: {
				readonly type: "string";
			};
		};
	};
};
export declare const ErrorObjectSchema: {
	readonly type: "object";
	readonly properties: {
		readonly error: {};
	};
};
export declare const textEncoder: TextEncoder;
export declare function existsAsync(file: string): Promise<boolean>;
export declare function concatBytes(...arrays: Uint8Array[]): Uint8Array;
export declare function bytesToHex(bytes: Uint8Array): string;
export declare function hexToBytes(hexString: string): Uint8Array;
export declare function rBytes(length?: number): Uint8Array;
export declare function digest(buf: Uint8Array, algorithm?: string): Promise<string>;
export declare function createID(): Promise<string>;
export declare function hashOrigin(ip: string): Promise<string>;
export declare const whitelistedSet: Set<string>;
export declare const traceSet: Set<string>;
export declare const filterSet: Set<string>;
export declare const rangeSet: Set<string>;
export declare const subscribeSet: Set<string>;

export {
	Proxy$1 as Proxy,
	__dirname$1 as __dirname,
};

export {};
