import { WebSocketProvider } from 'ethers';

async function test() {
    const provider = new WebSocketProvider('ws://localhost:8544/eth');

    console.log(await provider.getBlockNumber());

    provider.on('block', async (b) => {
        console.log(await provider.getBlock(b));
    });
}

test();
