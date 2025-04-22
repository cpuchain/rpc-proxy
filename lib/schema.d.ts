export declare const JsonRpcReqSchema: {
    readonly oneOf: readonly [{
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
                    readonly type: readonly ["string", "number"];
                };
                readonly method: {
                    readonly type: "string";
                };
                readonly params: {};
            };
            readonly required: readonly ["jsonrpc", "id", "method"];
        };
    }, {
        readonly type: "object";
        readonly properties: {
            readonly jsonrpc: {
                readonly type: "string";
            };
            readonly id: {
                readonly type: readonly ["string", "number"];
            };
            readonly method: {
                readonly type: "string";
            };
            readonly params: {};
        };
        readonly required: readonly ["jsonrpc", "id", "method"];
    }];
};
export declare const JsonRpcRespSchema: {
    readonly description: "JSONRPC 2.0 Response";
    readonly oneOf: readonly [{
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
                    readonly type: readonly ["string", "number"];
                };
                readonly result: {};
                readonly error: {};
            };
            readonly required: readonly ["jsonrpc", "id"];
        };
    }, {
        readonly type: "object";
        readonly properties: {
            readonly jsonrpc: {
                readonly type: "string";
            };
            readonly id: {
                readonly type: readonly ["string", "number"];
            };
            readonly result: {};
            readonly error: {};
        };
        readonly required: readonly ["jsonrpc", "id"];
    }];
};
export declare const BlockRespSchema: {
    readonly description: "Health Block Response";
    readonly type: "object";
    readonly properties: {
        readonly hash: {
            readonly type: "string";
        };
        readonly number: {
            readonly type: readonly ["string", "number"];
        };
        readonly timestamp: {
            readonly type: readonly ["string", "number"];
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
            readonly type: readonly ["string", "number"];
        };
        readonly gasUsed: {
            readonly type: readonly ["string", "number"];
        };
        readonly blobGasUsed: {
            readonly type: readonly ["string", "number"];
        };
        readonly excessBlobGas: {
            readonly type: readonly ["string", "number"];
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
            readonly type: readonly ["string", "number"];
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
