// Test requests (normal, batch, blocked, ws, ws_batch, ws_blocked)
import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import WebSocket from 'ws';

const RPC_URL = 'http://localhost:8544/eth';
const WS_URL = 'ws://localhost:8544/eth';

test();

export async function test() {
    // 1. JSONRPC test
    const provider = new JsonRpcProvider(RPC_URL);
    const wsProvider = new WebSocketProvider(WS_URL);

    console.log(
        await provider._send([
            {
                jsonrpc: '2.0',
                id: 0,
                method: 'web3_clientVersion',
                params: [],
            },
        ]),
    );

    console.log(
        await provider._send([
            {
                jsonrpc: '2.0',
                id: 0,
                method: 'eth_unsupported',
                params: [],
            },
        ]),
    );

    console.log(
        await provider._send([
            {
                jsonrpc: '2.0',
                id: 0,
                method: 'eth_chainId',
                params: [],
            },
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_blockNumber',
                params: [],
            },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'net_version',
                params: [],
            },
            {
                jsonrpc: '2.0',
                id: 3,
                method: 'web3_clientVersion',
                params: [],
            },
        ]),
    );

    console.log(
        await provider._send([
            {
                jsonrpc: '2.0',
                id: 0,
                method: 'eth_chainId',
                params: [],
            },
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_blockNumber',
                params: [],
            },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'admin_peers',
                params: [],
            },
        ]),
    );

    // Test WS

    console.log(
        await wsProvider._send({
            jsonrpc: '2.0',
            id: 0,
            method: 'web3_clientVersion',
            params: [],
        }),
    );

    console.log(
        await wsProvider._send({
            jsonrpc: '2.0',
            id: 0,
            method: 'admin_peers',
            params: [],
        }),
    );

    /**
     * WebSocketProvider of ethers.js doesn't support batch requests
    console.log(await wsProvider._send([
        {
            jsonrpc: '2.0',
            id: 0,
            method: 'eth_chainId',
            params: []
        },
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_blockNumber',
            params: []
        },
        {
            jsonrpc: '2.0',
            id: 2,
            method: 'net_version',
            params: []
        },
        {
            jsonrpc: '2.0',
            id: 3,
            method: 'web3_clientVersion',
            params: []
        }
    ]));

    console.log(await wsProvider._send([
        {
            jsonrpc: '2.0',
            id: 0,
            method: 'eth_chainId',
            params: []
        },
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_blockNumber',
            params: []
        },
        {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_unsupported',
            params: []
        }
    ]));
    **/
}

// Test batch requests with WebSocket provider here
export async function testWs() {
    const ws = new WebSocket(WS_URL);

    ws.onclose = () => {
        console.log('Connection closed');
    };

    ws.onerror = () => {
        ws.close();
    };

    ws.onopen = () => {
        console.log('Connection established');

        ws.send(
            JSON.stringify([
                {
                    jsonrpc: '2.0',
                    id: 0,
                    method: 'eth_chainId',
                    params: [],
                },
                {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_blockNumber',
                    params: [],
                },
                {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'net_version',
                    params: [],
                },
                {
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'web3_clientVersion',
                    params: [],
                },
            ]),
        );

        ws.send(
            JSON.stringify([
                {
                    jsonrpc: '2.0',
                    id: 0,
                    method: 'eth_chainId',
                    params: [],
                },
                {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_blockNumber',
                    params: [],
                },
                {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'admin_peers',
                    params: [],
                },
            ]),
        );
    };

    ws.onmessage = (d) => {
        const data = d?.data ? JSON.parse(d.data as unknown as string) : null;

        if (!data) {
            return;
        }

        console.log(data);
    };
}
