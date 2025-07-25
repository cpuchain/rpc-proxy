// Fork and override here for your desire
export const whitelistedSet = new Set([
    'eth_blobBaseFee',
    'eth_blockNumber',
    'eth_call',
    'eth_callMany',
    'eth_chainId',
    'eth_estimateGas',
    'eth_feeHistory',
    'eth_gasPrice',
    'eth_getAccount',
    'eth_getBalance',
    'eth_getBlockByHash',
    'eth_getBlockByNumber',
    'eth_getBlockReceipts',
    'eth_getBlockTransactionCountByHash',
    'eth_getBlockTransactionCountByNumber',
    'eth_getCode',
    'eth_getLogs',
    'eth_getProof',
    'eth_getStorageAt',
    'eth_getTransactionByBlockHashAndIndex',
    'eth_getTransactionByBlockNumberAndIndex',
    'eth_getTransactionByHash',
    'eth_getTransactionCount',
    'eth_getTransactionReceipt',
    'eth_getUncleCountByBlockHash',
    'eth_getUncleCountByBlockNumber',
    'eth_maxPriorityFeePerGas',
    'eth_simulateV1',
    'eth_syncing',
    'eth_sendRawTransaction',
    'net_version',
    'web3_clientVersion',
    'web3_sha3',
]);

export const traceSet = new Set([
    'trace_block',
    'trace_call',
    'trace_callMany',
    'trace_filter',
    'trace_rawTransaction',
    'trace_replayBlockTransactions',
    'trace_replayTransaction',
    'trace_transaction',
    'debug_getBadBlocks',
    'debug_storageRangeAt',
    'debug_getTrieFlushInterval',
    'debug_traceBlock',
    'debug_traceBlockByHash',
    'debug_traceBlockByNumber',
    'debug_traceCall',
    'debug_traceTransaction',
]);

// filter methods disabled as they consume a lot of CPU resources :(
export const filterSet = new Set([
    'eth_getFilterChanges',
    'eth_getFilterLogs',
    'eth_newBlockFilter',
    'eth_newFilter',
    'eth_newPendingTransactionFilter',
    'eth_uninstallFilter',
]);

export const rangeSet = new Set(['eth_getLogs', 'eth_newFilter']);

export const subscribeSet = new Set(['eth_subscribe', 'eth_unsubscribe']);
