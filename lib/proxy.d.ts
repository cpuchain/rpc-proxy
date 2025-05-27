import type WebSocket from 'ws';
import { Logger } from '@cpuchain/logger';
import { FastifyInstance } from 'fastify';
import { ValidateFunction } from 'ajv';
import { Config } from './config';
import { WebSocketRequest } from './ws';
export type WebSocketWithRequest = WebSocket.WebSocket & {
    request: Promise<WebSocketRequest>;
};
export interface MsgAddCount {
    id: string;
    type: 'addCount';
    key: string;
    score: number;
}
export interface MsgSession {
    id: string;
    type: 'addSession' | 'removeSession';
    key: string;
    session: string;
}
export interface MsgBlockNumber {
    id: string;
    type: 'getBlockNumber';
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
export declare function initProxy(proxy: Proxy): Promise<void>;
export declare class Proxy {
    config: Config;
    logger: Logger;
    app: FastifyInstance;
    reqSchema: ValidateFunction<boolean>;
    forkId: number;
    sockets: Set<WebSocketWithRequest>;
    msgQueue: MsgQueue[];
    constructor(config: Config, forkId?: number);
}
