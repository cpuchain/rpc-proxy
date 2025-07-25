import { WebSocket } from 'ws';
import { JsonRpcReq, JsonRpcResp, BasicRequest, markError, BasicRequestParams } from './request.js';

export interface WSQueue {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: (msg: any) => void;
    reject: (err: Error) => void;
    timeout?: NodeJS.Timeout;
    resolved: boolean;
}

export function sendWS(
    request: WebSocketRequest,
    req: JsonRpcReq | JsonRpcReq[],
): Promise<JsonRpcResp | JsonRpcResp[]> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        const id = Array.isArray(req) ? req.map((r) => r.id).join(',') : req.id;
        const origin = await request.hOrigin;

        if (request.queue.findIndex((q) => q.id === id) !== -1) {
            request.logger?.debug('FILTER', `${origin}: WS request contains duplidated id`);
            resolve(markError(req, -32601, 'Request contains duplidated id'));
            return;
        }

        const queue = {
            id,
            resolve,
            reject,
            resolved: false,
        } as WSQueue;

        // should solve on reconnection when the expected message is never received
        queue.timeout = setTimeout(() => {
            if (!queue.resolved) {
                request.logger?.debug(
                    'PROXY',
                    `${origin}: WS request timed out after ${request.backend.timeout * 1000} ms`,
                );
                queue.reject(new Error('Request timeout'));
                queue.resolved = true;
            }
        }, request.backend.timeout * 1000);

        request.queue.push(queue);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await request.ws)?.send(JSON.stringify(req), (err: any) => {
            if (err) {
                reject(err);
            }
        });
    });
}

export function connectWSRpc(request: WebSocketRequest): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        if (!request.backend.wsUrl) {
            reject(new Error('Invalid WS URL'));
            return;
        }

        const ws = new WebSocket(request.backend.wsUrl);

        ws.onclose = () => {
            request.onDisconnect?.();
        };

        ws.onerror = () => {
            ws.close();
        };

        ws.onopen = () => {
            resolve(ws);
        };

        ws.onmessage = (d) => {
            try {
                const data = d?.data
                    ? JSON.parse(d.data as unknown as string)
                    : (null as JsonRpcResp | JsonRpcResp[] | null);

                if (!data) {
                    return;
                }

                const id = Array.isArray(data) ? data.map((r) => r.id).join(',') : data.id;

                const queue = request.queue.find((r) => r.id === id);

                if (!queue) {
                    request.onSubscribe?.(data);
                    return;
                }

                queue.resolve(data);
                queue.resolved = true;

                request.queue = request.queue.filter((q) => !q.resolved);

                // eslint-disable-next-line no-empty
            } catch {}
        };
    });
}

export type onDisconnect = () => void;

export type onSubscribe = (data: JsonRpcResp | JsonRpcResp[]) => void;

export class WebSocketRequest extends BasicRequest {
    wid: string;
    checked: boolean;

    ws?: Promise<WebSocket>;
    onDisconnect?: onDisconnect;
    onSubscribe?: onSubscribe;

    queue: WSQueue[];

    constructor(params: BasicRequestParams & { wid: string }) {
        super(params);

        this.wid = params.wid;
        this.checked = true;

        this.queue = [];

        this.supportSubscribe = true;
    }

    async connect(): Promise<WebSocket> {
        if (!this.ws) {
            this.ws = connectWSRpc(this);
        }
        return this.ws;
    }

    async terminate(): Promise<void> {
        if (!this.ws) {
            return;
        }
        (await this.ws).terminate();
    }

    async sendUpstream(req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]> {
        await this.connect();

        return await sendWS(this, req);
    }
}
