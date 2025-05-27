import { JsonRpcReq, JsonRpcResp, BasicRequest } from './request';
export declare class PostRequest extends BasicRequest {
    sendUpstream(req: JsonRpcReq | JsonRpcReq[]): Promise<JsonRpcResp | JsonRpcResp[]>;
}
