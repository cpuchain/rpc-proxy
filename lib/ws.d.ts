import WebSocket from 'ws';
import { JsonRpcReq, JsonRpcResp, BasicRequest, BasicRequestParams } from './request';
export interface WSQueue {
    id: string;
    resolve: (msg: any) => void;
    reject: (err: Error) => void;
    timeout?: NodeJS.Timeout;
    resolved: boolean;
}
export declare function sendWS(request: WebSocketRequest, req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
export declare function connectWSRpc(request: WebSocketRequest): Promise<WebSocket.WebSocket>;
export type onDisconnect = () => void;
export type onSubscribe = (data: JsonRpcResp | JsonRpcResp[]) => void;
export declare class WebSocketRequest extends BasicRequest {
    wid: string;
    checked: boolean;
    ws?: Promise<WebSocket.WebSocket>;
    onDisconnect?: onDisconnect;
    onSubscribe?: onSubscribe;
    queue: WSQueue[];
    constructor(params: BasicRequestParams & {
        wid: string;
    });
    connect(): Promise<WebSocket.WebSocket>;
    terminate(): Promise<void>;
    sendUpstream(req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
}
