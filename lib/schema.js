"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorObjectSchema = exports.BlockRespSchema = exports.JsonRpcRespSchema = exports.JsonRpcReqSchema = void 0;
exports.JsonRpcReqSchema = {
    oneOf: [
        {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
                type: 'object',
                properties: {
                    jsonrpc: { type: 'string' },
                    id: { type: ['string', 'number'] },
                    method: { type: 'string' },
                    params: {},
                },
                required: ['jsonrpc', 'id', 'method'],
            },
        },
        {
            type: 'object',
            properties: {
                jsonrpc: { type: 'string' },
                id: { type: ['string', 'number'] },
                method: { type: 'string' },
                params: {},
            },
            required: ['jsonrpc', 'id', 'method'],
        },
    ],
};
exports.JsonRpcRespSchema = {
    description: 'JSONRPC 2.0 Response',
    oneOf: [
        {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
                type: 'object',
                properties: {
                    jsonrpc: { type: 'string' },
                    id: { type: ['string', 'number'] },
                    result: {},
                    error: {},
                },
                required: ['jsonrpc', 'id'],
            },
        },
        {
            type: 'object',
            properties: {
                jsonrpc: { type: 'string' },
                id: { type: ['string', 'number'] },
                result: {},
                error: {},
            },
            required: ['jsonrpc', 'id'],
        },
    ],
};
exports.BlockRespSchema = {
    description: 'Health Block Response',
    type: 'object',
    properties: {
        hash: { type: 'string' },
        number: { type: ['string', 'number'] },
        timestamp: { type: ['string', 'number'] },
        parentHash: { type: 'string' },
        parentBeaconBlockRoot: { type: 'string' },
        nonce: { type: 'string' },
        difficulty: { type: 'string' },
        gasLimit: { type: ['string', 'number'] },
        gasUsed: { type: ['string', 'number'] },
        blobGasUsed: { type: ['string', 'number'] },
        excessBlobGas: { type: ['string', 'number'] },
        miner: { type: 'string' },
        prevRandao: { type: 'string' },
        extraData: { type: 'string' },
        baseFeePerGas: { type: ['string', 'number'] },
        stateRoot: { type: 'string' },
        receiptsRoot: { type: 'string' },
        transactions: {
            type: 'array',
            items: { type: 'string' },
        },
    },
};
exports.ErrorObjectSchema = {
    type: 'object',
    properties: {
        error: {},
    },
};
