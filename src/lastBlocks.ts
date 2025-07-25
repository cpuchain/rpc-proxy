import type { BackendConfig, Config } from './config.js';
import { PostRequest } from './post.js';

export async function refreshBlocks(
    lastBlocks: LastBlocks,
    backendGroup: Record<string, BackendConfig[]>,
): Promise<void> {
    await Promise.all(
        Object.entries(backendGroup).map(async ([chain, backends]) => {
            try {
                lastBlocks.blocks[chain] = await new PostRequest({ backend: backends[0] }).getBlockNumber();

                // eslint-disable-next-line no-empty
            } catch {}
        }),
    );
}

export class LastBlocks {
    blocks: Record<string, number>;

    blocksPromise?: Promise<void>;

    constructor(config: Config) {
        this.blocks = {};

        if (config.blockRefresh) {
            this.blocksPromise = refreshBlocks(this, config.backendGroup);
            // Refresh block every second
            setInterval(() => refreshBlocks(this, config.backendGroup), config.blockRefresh * 1000);
        }
    }
}
