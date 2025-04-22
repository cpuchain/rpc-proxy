"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostRequest = void 0;
const request_1 = require("./request");
class PostRequest extends request_1.BasicRequest {
    async sendUpstream(req) {
        if (!req) {
            return {};
        }
        if (Array.isArray(req) && !req.length) {
            return [];
        }
        const resp = await fetch(this.backend.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req),
            signal: AbortSignal.timeout(this.backend.timeout * 1000),
        });
        if (!resp.ok) {
            const methods = Array.isArray(req)
                ? [...new Set(req.map((r) => r.method))].join(', ')
                : req.method;
            this.logger?.debug('PROXY', `${await this.hOrigin}: Upstream returned ${resp.status} error ( ${methods} )`);
            return (0, request_1.markError)(req, -32000, `Upstream request returned ${resp.status}`);
        }
        return (await resp.json());
    }
}
exports.PostRequest = PostRequest;
