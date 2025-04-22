"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketRequest = void 0;
exports.sendWS = sendWS;
exports.connectWSRpc = connectWSRpc;
const ws_1 = __importDefault(require("ws"));
const request_1 = require("./request");
function sendWS(request, req) {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        const id = Array.isArray(req) ? req.map((r) => r.id).join(',') : req.id;
        const origin = await request.hOrigin;
        if (request.queue.findIndex((q) => q.id === id) !== -1) {
            request.logger?.debug('FILTER', `${origin}: WS request contains duplidated id`);
            resolve((0, request_1.markError)(req, -32601, 'Request contains duplidated id'));
            return;
        }
        const queue = {
            id,
            resolve,
            reject,
            resolved: false,
        };
        // should solve on reconnection when the expected message is never received
        queue.timeout = setTimeout(() => {
            if (!queue.resolved) {
                request.logger?.debug('PROXY', `${origin}: WS request timed out after ${request.backend.timeout * 1000} ms`);
                queue.reject(new Error('Request timeout'));
                queue.resolved = true;
            }
        }, request.backend.timeout * 1000);
        request.queue.push(queue);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await request.ws)?.send(JSON.stringify(req), (err) => {
            if (err) {
                reject(err);
            }
        });
    });
}
function connectWSRpc(request) {
    return new Promise((resolve, reject) => {
        if (!request.backend.wsUrl) {
            reject(new Error('Invalid WS URL'));
            return;
        }
        const ws = new ws_1.default(request.backend.wsUrl);
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
                    ? JSON.parse(d.data)
                    : null;
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
            }
            catch { }
        };
    });
}
class WebSocketRequest extends request_1.BasicRequest {
    wid;
    checked;
    ws;
    onDisconnect;
    onSubscribe;
    queue;
    constructor(params) {
        super(params);
        this.wid = params.wid;
        this.checked = true;
        this.queue = [];
        this.supportSubscribe = true;
    }
    async connect() {
        if (!this.ws) {
            this.ws = connectWSRpc(this);
        }
        return this.ws;
    }
    async terminate() {
        if (!this.ws) {
            return;
        }
        (await this.ws).terminate();
    }
    async sendUpstream(req) {
        await this.connect();
        return await sendWS(this, req);
    }
}
exports.WebSocketRequest = WebSocketRequest;
