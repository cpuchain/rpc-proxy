import { JsonRpcReq, JsonRpcResp, BasicRequest, markError } from './request.js';

export class PostRequest extends BasicRequest {
    async sendUpstream(req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]> {
        if (!req) {
            return {} as JsonRpcResp;
        }
        if (Array.isArray(req) && !req.length) {
            return [] as JsonRpcResp[];
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
            this.logger?.debug(
                'PROXY',
                `${await this.hOrigin}: Upstream returned ${resp.status} error ( ${methods} )`,
            );
            return markError(req, -32000, `Upstream request returned ${resp.status}`);
        }

        return (await resp.json()) as JsonRpcResp | JsonRpcResp[];
    }
}
