"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LastBlocks = void 0;
exports.refreshBlocks = refreshBlocks;
const post_1 = require("./post");
async function refreshBlocks(lastBlocks, backendGroup) {
    await Promise.all(Object.entries(backendGroup).map(async ([chain, backends]) => {
        try {
            lastBlocks.blocks[chain] = await new post_1.PostRequest({ backend: backends[0] }).getBlockNumber();
            // eslint-disable-next-line no-empty
        }
        catch { }
    }));
}
class LastBlocks {
    blocks;
    blocksPromise;
    constructor(config) {
        this.blocks = {};
        if (config.blockRefresh) {
            this.blocksPromise = refreshBlocks(this, config.backendGroup);
            // Refresh block every second
            setInterval(() => refreshBlocks(this, config.backendGroup), config.blockRefresh * 1000);
        }
    }
}
exports.LastBlocks = LastBlocks;
