'use strict';

var os = require('os');
var fs = require('fs');
var ajv = require('ajv');
var promises = require('fs/promises');
var crypto = require('crypto');
var process$1 = require('process');
var path = require('path');
var url = require('url');
var loggerChain = require('logger-chain');
var fastify = require('fastify');
var cors = require('@fastify/cors');
var websocket = require('@fastify/websocket');
var fastifySwagger = require('@fastify/swagger');
var fastifySwaggerUi = require('@fastify/swagger-ui');
var ws = require('ws');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
const configSchema = {
  type: "object",
  properties: {
    host: { type: "string" },
    port: { type: "number" },
    workers: { type: "number" },
    logLevel: { type: "string" },
    reverseProxy: { type: "boolean" },
    swaggerApi: { type: "string" },
    redirect: { type: "string" },
    healthyAge: { type: "number" },
    interval: { type: "number" },
    ratelimit: { type: "number" },
    concurrency: { type: "number" },
    maxBodySize: { type: "number" },
    blockRefresh: { type: "number" },
    maxBlockRange: { type: "number" },
    backends: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          chain: { type: "string" },
          url: { type: "string" },
          wsUrl: { type: "string" },
          trace: { type: "boolean" },
          filter: { type: "boolean" },
          timeout: { type: "number" }
        },
        required: ["chain", "url"]
      }
    }
  },
  required: ["backends"]
};
function getConfig() {
  const configFile = process.env.CONFIG_FILE || "config.json";
  if (!fs.existsSync(configFile)) {
    throw new Error("Config file not found");
  }
  const config = JSON.parse(fs.readFileSync(configFile, { encoding: "utf8" }));
  const ajv$1 = new ajv.Ajv();
  if (!ajv$1.compile(configSchema)(config)) {
    throw new Error("Invalid config, check the config.example.json and verify if config is valid");
  }
  config.host = config.host || "127.0.0.1";
  config.port = config.port || 8544;
  config.workers = config.workers || os.cpus().length;
  config.logLevel = config.logLevel || "debug";
  config.reverseProxy = config.reverseProxy ?? true;
  config.healthyAge = config.healthyAge || 1800;
  config.interval = config.interval || 60;
  config.ratelimit = config.ratelimit || 100;
  config.concurrency = config.concurrency || 50;
  config.maxBodySize = config.maxBodySize || 10485760;
  for (const backend of config.backends) {
    backend.timeout = backend.timeout || 120;
  }
  config.backendGroup = config.backends.reduce(
    (acc, curr) => {
      if (!acc[curr.chain]) {
        acc[curr.chain] = [];
      }
      acc[curr.chain].push(curr);
      return acc;
    },
    {}
  );
  return config;
}

const whitelistedSet = /* @__PURE__ */ new Set([
  "eth_blobBaseFee",
  "eth_blockNumber",
  "eth_call",
  "eth_callMany",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getAccount",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockReceipts",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_maxPriorityFeePerGas",
  "eth_simulateV1",
  "eth_syncing",
  "eth_sendRawTransaction",
  "net_version",
  "web3_clientVersion",
  "web3_sha3"
]);
const traceSet = /* @__PURE__ */ new Set([
  "trace_block",
  "trace_call",
  "trace_callMany",
  "trace_filter",
  "trace_rawTransaction",
  "trace_replayBlockTransactions",
  "trace_replayTransaction",
  "trace_transaction",
  "debug_getBadBlocks",
  "debug_storageRangeAt",
  "debug_getTrieFlushInterval",
  "debug_traceBlock",
  "debug_traceBlockByHash",
  "debug_traceBlockByNumber",
  "debug_traceCall",
  "debug_traceTransaction"
]);
const filterSet = /* @__PURE__ */ new Set([
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_newBlockFilter",
  "eth_newFilter",
  "eth_newPendingTransactionFilter",
  "eth_uninstallFilter"
]);
const rangeSet = /* @__PURE__ */ new Set(["eth_getLogs", "eth_newFilter"]);
const subscribeSet = /* @__PURE__ */ new Set(["eth_subscribe", "eth_unsubscribe"]);

const textEncoder = new TextEncoder();
async function existsAsync(file) {
  try {
    await promises.stat(file);
    return true;
  } catch {
    return false;
  }
}
function concatBytes(...arrays) {
  const totalSize = arrays.reduce((acc, e) => acc + e.length, 0);
  const merged = new Uint8Array(totalSize);
  arrays.forEach((array, i, arrays2) => {
    const offset = arrays2.slice(0, i).reduce((acc, e) => acc + e.length, 0);
    merged.set(array, offset);
  });
  return merged;
}
function bytesToHex(bytes) {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hexString) {
  if (hexString.slice(0, 2) === "0x") {
    hexString = hexString.slice(2);
  }
  if (hexString.length % 2 !== 0) {
    hexString = "0" + hexString;
  }
  return Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}
function rBytes(length = 32) {
  return crypto.webcrypto.getRandomValues(new Uint8Array(length));
}
async function digest(buf, algorithm = "SHA-256") {
  return bytesToHex(new Uint8Array(await crypto.webcrypto.subtle.digest(algorithm, buf)));
}
async function createID() {
  return (await digest(concatBytes(rBytes(16), hexToBytes(Date.now().toString(16))), "SHA-1")).substr(
    0,
    18
  );
}
async function hashOrigin(ip) {
  return (await digest(textEncoder.encode(ip), "SHA-1")).substr(0, 18);
}

function markNewError(code = -32603, message = "Internal error") {
  return markError({ jsonrpc: "2.0", id: 0, method: "" }, code, message);
}
function markError(reqs, code = -32603, message = "Internal error") {
  if (Array.isArray(reqs)) {
    return reqs.map((req) => ({
      jsonrpc: req.jsonrpc,
      id: req.id,
      error: {
        code,
        message
      }
    }));
  }
  return {
    jsonrpc: reqs.jsonrpc,
    id: reqs.id,
    error: {
      code,
      message
    }
  };
}
function rewriteTag(blockTag, lastKnownBlock) {
  if (typeof blockTag === "number") {
    return blockTag;
  } else if (typeof blockTag === "undefined") {
    return 0;
  } else if (blockTag === "earliest") {
    return 0;
  } else if (blockTag === "latest") {
    return lastKnownBlock;
  } else if (blockTag === "pending") {
    return lastKnownBlock;
  } else if (blockTag === "finalized") {
    return lastKnownBlock;
  } else if (blockTag === "safe") {
    return lastKnownBlock;
  }
  return Number(blockTag);
}
function filterGetLogParam(maxBlockRange, param, lastKnownBlock) {
  return param.filter((p) => {
    if (p.blockHash) {
      return false;
    }
    const [fromBlock, toBlock] = [
      rewriteTag(p.fromBlock, lastKnownBlock),
      rewriteTag(p.toBlock, lastKnownBlock)
    ];
    if (toBlock - fromBlock > maxBlockRange) {
      return true;
    }
    return false;
  }).length === 0;
}
async function filterGetLogs(request, reqs) {
  if (!request.maxBlockRange) {
    return true;
  }
  const lastBlockNumber = await request.getSavedBlockNumber();
  if (!lastBlockNumber) {
    return true;
  }
  if (Array.isArray(reqs)) {
    return reqs.filter((r) => {
      if (r.method === "eth_getLogs" || r.method === "eth_newFilter") {
        if (!filterGetLogParam(
          request.maxBlockRange,
          r.params,
          lastBlockNumber
        )) {
          return true;
        }
      }
      return false;
    }).length === 0;
  }
  return filterGetLogParam(request.maxBlockRange, reqs.params, lastBlockNumber);
}
async function filterRequest(request, reqs) {
  const { hOrigin, logger, supportSubscribe, backend } = request;
  const origin = await hOrigin;
  try {
    if (Array.isArray(reqs)) {
      const uniqueIds = [...new Set(reqs.map((r) => r.id))];
      const uniqueMethods = [...new Set(reqs.map((r) => r.method))];
      if (uniqueIds.length !== reqs.length) {
        logger?.debug("FILTER", `${origin}: ${reqs.length} reqs filtered with id`);
        return markError(reqs, -32601, "Batch should have unique ids");
      }
      if (origin && request.rateLimit) {
        if (!await request.rateLimit(origin, reqs.length)) {
          logger?.debug("LIMITED", `${origin}: Rate limited`);
          return markError(reqs, -32029, "Rate limited");
        }
      }
      if (uniqueMethods.filter(
        (method) => !(subscribeSet.has(method) && supportSubscribe) && !(traceSet.has(method) && backend.trace) && !(filterSet.has(method) && backend.filter) && !whitelistedSet.has(method)
      ).length) {
        logger?.debug(
          "FILTER",
          `${origin}: ${reqs.length} reqs filtered ( ${uniqueMethods.join(", ")} )`
        );
        return markError(reqs, -32601, "Request contains unsupported method");
      }
      if (uniqueMethods.filter((method) => rangeSet.has(method)).length) {
        if (!await filterGetLogs(request, reqs)) {
          logger?.debug(
            "FILTER",
            `${origin}: ${reqs.length} reqs filtered with invalid eth_getLogs params`
          );
          return markError(reqs, -32601, "Request contains invalid block params");
        }
      }
      logger?.debug("PROXY", `${origin}: ${reqs.length} reqs ( ${uniqueMethods.join(", ")} )`);
      return await request.sendUpstream(reqs);
    }
    if (origin && request.rateLimit) {
      if (!await request.rateLimit(origin, 1)) {
        logger?.debug("LIMITED", `${origin}: Rate limited`);
        return markError(reqs, -32029, "Rate limited");
      }
    }
    if (!(subscribeSet.has(reqs.method) && supportSubscribe) && !(traceSet.has(reqs.method) && backend.trace) && !(filterSet.has(reqs.method) && backend.filter) && !whitelistedSet.has(reqs.method)) {
      logger?.debug("FILTER", `${origin}: request filtered with ${reqs.method} method`);
      return markError(reqs, -32601, "Request contains unsupported method");
    }
    if (rangeSet.has(reqs.method)) {
      if (!await filterGetLogs(request, reqs)) {
        logger?.debug("FILTER", `${origin}: request filtered with invalid eth_getLogs params`);
        return markError(reqs, -32601, "Request contains invalid block params");
      }
    }
    logger?.debug("PROXY", `${origin}: ${reqs.method}`);
    return await request.sendUpstream(reqs);
  } catch {
    logger?.debug("FILTER", `${origin}: Unknown filter error`);
    return markNewError(-32603, "Unknown filter error");
  }
}
class BasicRequest {
  maxBlockRange;
  backend;
  hOrigin;
  rateLimit;
  blockFunc;
  logger;
  supportSubscribe;
  constructor({ maxBlockRange, backend, origin, rateLimit, blockFunc, logger }) {
    this.maxBlockRange = maxBlockRange;
    this.backend = backend;
    this.hOrigin = origin ? hashOrigin(origin) : new Promise((resolve) => resolve(""));
    this.rateLimit = rateLimit;
    this.blockFunc = blockFunc;
    this.logger = logger;
    this.supportSubscribe = false;
  }
  async send(reqs) {
    return filterRequest(this, reqs);
  }
  async sendUpstream(reqs) {
    return filterRequest(this, reqs);
  }
  async getBlockNumber() {
    const { result, error } = await this.sendUpstream({
      jsonrpc: "2.0",
      id: 0,
      method: "eth_blockNumber"
    });
    if (error) {
      throw new Error(JSON.stringify(error));
    }
    return Number(result);
  }
  async getSavedBlockNumber() {
    return this.blockFunc ? await this.blockFunc(this.backend.chain) : 0;
  }
  async getBlock() {
    const { result, error } = await this.sendUpstream({
      jsonrpc: "2.0",
      id: 0,
      method: "eth_getBlockByNumber",
      params: ["latest", false]
    });
    if (error) {
      throw new Error(JSON.stringify(error));
    }
    return result;
  }
}

class PostRequest extends BasicRequest {
  async sendUpstream(req) {
    if (!req) {
      return {};
    }
    if (Array.isArray(req) && !req.length) {
      return [];
    }
    const resp = await fetch(this.backend.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(this.backend.timeout * 1e3)
    });
    if (!resp.ok) {
      const methods = Array.isArray(req) ? [...new Set(req.map((r) => r.method))].join(", ") : req.method;
      this.logger?.debug(
        "PROXY",
        `${await this.hOrigin}: Upstream returned ${resp.status} error ( ${methods} )`
      );
      return markError(req, -32e3, `Upstream request returned ${resp.status}`);
    }
    return await resp.json();
  }
}

async function refreshBlocks(lastBlocks, backendGroup) {
  await Promise.all(
    Object.entries(backendGroup).map(async ([chain, backends]) => {
      try {
        lastBlocks.blocks[chain] = await new PostRequest({ backend: backends[0] }).getBlockNumber();
      } catch {
      }
    })
  );
}
class LastBlocks {
  blocks;
  blocksPromise;
  constructor(config) {
    this.blocks = {};
    if (config.blockRefresh) {
      this.blocksPromise = refreshBlocks(this, config.backendGroup);
      setInterval(() => refreshBlocks(this, config.backendGroup), config.blockRefresh * 1e3);
    }
  }
}

const pkgJson = {
  "name": "rpc-proxy",
  "version": "1.0.4",
  "description": "Reverse RPC Proxy for EVM chains"};

const JsonRpcReqSchema = {
  oneOf: [
    {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        properties: {
          jsonrpc: { type: "string" },
          id: { type: ["string", "number"] },
          method: { type: "string" },
          params: {}
        },
        required: ["jsonrpc", "id", "method"]
      }
    },
    {
      type: "object",
      properties: {
        jsonrpc: { type: "string" },
        id: { type: ["string", "number"] },
        method: { type: "string" },
        params: {}
      },
      required: ["jsonrpc", "id", "method"]
    }
  ]
};
const JsonRpcRespSchema = {
  description: "JSONRPC 2.0 Response",
  oneOf: [
    {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        properties: {
          jsonrpc: { type: "string" },
          id: { type: ["string", "number"] },
          result: {},
          error: {}
        },
        required: ["jsonrpc", "id"]
      }
    },
    {
      type: "object",
      properties: {
        jsonrpc: { type: "string" },
        id: { type: ["string", "number"] },
        result: {},
        error: {}
      },
      required: ["jsonrpc", "id"]
    }
  ]
};
const BlockRespSchema = {
  description: "Health Block Response",
  type: "object",
  properties: {
    hash: { type: "string" },
    number: { type: ["string", "number"] },
    timestamp: { type: ["string", "number"] },
    parentHash: { type: "string" },
    parentBeaconBlockRoot: { type: "string" },
    nonce: { type: "string" },
    difficulty: { type: "string" },
    gasLimit: { type: ["string", "number"] },
    gasUsed: { type: ["string", "number"] },
    blobGasUsed: { type: ["string", "number"] },
    excessBlobGas: { type: ["string", "number"] },
    miner: { type: "string" },
    prevRandao: { type: "string" },
    extraData: { type: "string" },
    baseFeePerGas: { type: ["string", "number"] },
    stateRoot: { type: "string" },
    receiptsRoot: { type: "string" },
    transactions: {
      type: "array",
      items: { type: "string" }
    }
  }
};
const ErrorObjectSchema = {
  type: "object",
  properties: {
    error: {}
  }
};

function sendWS(request, req) {
  return new Promise(async (resolve, reject) => {
    const id = Array.isArray(req) ? req.map((r) => r.id).join(",") : req.id;
    const origin = await request.hOrigin;
    if (request.queue.findIndex((q) => q.id === id) !== -1) {
      request.logger?.debug("FILTER", `${origin}: WS request contains duplidated id`);
      resolve(markError(req, -32601, "Request contains duplidated id"));
      return;
    }
    const queue = {
      id,
      resolve,
      reject,
      resolved: false
    };
    queue.timeout = setTimeout(() => {
      if (!queue.resolved) {
        request.logger?.debug(
          "PROXY",
          `${origin}: WS request timed out after ${request.backend.timeout * 1e3} ms`
        );
        queue.reject(new Error("Request timeout"));
        queue.resolved = true;
      }
    }, request.backend.timeout * 1e3);
    request.queue.push(queue);
    (await request.ws)?.send(JSON.stringify(req), (err) => {
      if (err) {
        reject(err);
      }
    });
  });
}
function connectWSRpc(request) {
  return new Promise((resolve, reject) => {
    if (!request.backend.wsUrl) {
      reject(new Error("Invalid WS URL"));
      return;
    }
    const ws$1 = new ws.WebSocket(request.backend.wsUrl);
    ws$1.onclose = () => {
      request.onDisconnect?.();
    };
    ws$1.onerror = () => {
      ws$1.close();
    };
    ws$1.onopen = () => {
      resolve(ws$1);
    };
    ws$1.onmessage = (d) => {
      try {
        const data = d?.data ? JSON.parse(d.data) : null;
        if (!data) {
          return;
        }
        const id = Array.isArray(data) ? data.map((r) => r.id).join(",") : data.id;
        const queue = request.queue.find((r) => r.id === id);
        if (!queue) {
          request.onSubscribe?.(data);
          return;
        }
        queue.resolve(data);
        queue.resolved = true;
        request.queue = request.queue.filter((q) => !q.resolved);
      } catch {
      }
    };
  });
}
class WebSocketRequest extends BasicRequest {
  wid;
  checked;
  ws;
  onDisconnect;
  onSubscribe;
  queue;
  constructor(params) {
    super(params);
    this.wid = params.wid;
    this.checked = true;
    this.queue = [];
    this.supportSubscribe = true;
  }
  async connect() {
    if (!this.ws) {
      this.ws = connectWSRpc(this);
    }
    return this.ws;
  }
  async terminate() {
    if (!this.ws) {
      return;
    }
    (await this.ws).terminate();
  }
  async sendUpstream(req) {
    await this.connect();
    return await sendWS(this, req);
  }
}

const __dirname$1 = path.dirname(url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href))));
const swaggerUiDir = path.join(__dirname$1, "../node_modules/@fastify/swagger-ui/static");
async function initProxy(proxy) {
  const { config, logger, app, reqSchema, forkId } = proxy;
  process$1.on("message", (msg) => {
    const queue = proxy.msgQueue.find((q) => q.id === msg.id);
    if (!queue) {
      return;
    }
    queue.resolve(msg.result);
    queue.resolved = true;
    proxy.msgQueue = proxy.msgQueue.filter((q) => !q.resolved);
  });
  function sendMessage(msg) {
    return new Promise(async (resolve, reject) => {
      if (!process$1.send) {
        reject(new Error("Not cluster"));
        return;
      }
      const id = await createID();
      const queue = {
        id,
        resolve,
        reject,
        resolved: false
      };
      queue.timeout = setTimeout(() => {
        if (!queue.resolved) {
          queue.reject(new Error("Request timeout"));
          queue.resolved = true;
        }
      }, 10 * 1e3);
      proxy.msgQueue.push(queue);
      process$1.send({
        id,
        ...msg
      });
    });
  }
  function setRateLimit(key, type, score, session) {
    return sendMessage({
      type,
      key,
      score,
      session
    });
  }
  function getBlockNumber(chain) {
    return sendMessage({
      type: "getBlockNumber",
      chain
    });
  }
  async function handleReq(req, reply, backend) {
    try {
      const reqBody = req.body;
      const request = new PostRequest({
        maxBlockRange: config.maxBlockRange,
        backend,
        origin: req.ip,
        rateLimit: (origin, count) => {
          return setRateLimit(origin, "addCount", count);
        },
        blockFunc: (chain) => {
          return getBlockNumber(chain);
        },
        logger
      });
      reply.send(await request.send(reqBody));
    } catch {
      logger.debug("PROXY", "Unknown POST error");
      reply.send(markNewError(void 0, "Unknown POST error"));
    }
  }
  async function handleHealth(req, reply, backend) {
    try {
      const request = new PostRequest({
        maxBlockRange: config.maxBlockRange,
        backend,
        origin: req.ip,
        rateLimit: (origin, count) => {
          return setRateLimit(origin, "addCount", count);
        },
        blockFunc: (chain) => {
          return getBlockNumber(chain);
        },
        logger
      });
      const block = await request.getBlock();
      const isHealthy = Number(block?.timestamp || 0) + config.healthyAge > Math.floor(Date.now() / 1e3);
      reply.code(isHealthy ? 200 : 502).send(block);
    } catch {
      logger.debug("PROXY", "Unknown /health error");
      reply.code(502).send({ error: "Unknown /health error" });
    }
  }
  function handleWS(socket, req, backend) {
    try {
      if (!backend.wsUrl) {
        socket.send("WS backend unavailable");
        socket.terminate();
        return;
      }
      if (!socket.request) {
        socket.request = (async () => {
          const wid = await createID();
          const request = new WebSocketRequest({
            wid,
            maxBlockRange: config.maxBlockRange,
            backend,
            origin: req.ip,
            rateLimit: (origin2, count) => {
              return setRateLimit(origin2, "addCount", count);
            },
            blockFunc: (chain) => {
              return getBlockNumber(chain);
            },
            logger
          });
          const origin = await request.hOrigin;
          if (!await setRateLimit(origin, "addSession", void 0, wid)) {
            logger.debug("LIMITED", `${origin}: Connection limited`);
            socket.send(JSON.stringify(markNewError(-32029, "Connection limited")));
            socket.terminate();
            return request;
          }
          await request.connect();
          logger.debug("PROXY", `${origin}: New socket ${wid} connected`);
          proxy.sockets.add(socket);
          request.onDisconnect = () => {
            (async () => {
              socket.terminate();
              setRateLimit(origin, "removeSession", void 0, wid);
              proxy.sockets.delete(socket);
            })();
          };
          request.onSubscribe = (data) => {
            socket.send(JSON.stringify(data));
          };
          return request;
        })();
      }
      socket.on("message", (e) => {
        (async () => {
          try {
            const request = await socket.request;
            const parsedData = JSON.parse(
              Buffer.isBuffer(e) ? e.toString() : e
            );
            if (!reqSchema(parsedData)) {
              logger.debug("FILTER", `${await request.hOrigin}: Invalid WS data`);
              socket.send(JSON.stringify(markNewError(-32600, "Invalid data")));
              socket.terminate();
              return;
            }
            socket.send(JSON.stringify(await request.send(parsedData)));
          } catch {
            logger.debug("PROXY", "Unknown WS input data error");
            socket.send(JSON.stringify(markNewError(void 0, "Unknown WS input data error")));
          }
        })();
      });
      socket.on("pong", () => {
        (async () => {
          const request = await socket.request;
          request.checked = true;
        })();
      });
      socket.on("error", () => {
        (async () => {
          const request = await socket.request;
          socket.terminate();
          request.terminate();
          setRateLimit(await request.hOrigin, "removeSession", void 0, request.wid);
          proxy.sockets.delete(socket);
        })();
      });
      socket.on("close", () => {
        (async () => {
          const request = await socket.request;
          const origin = await request.hOrigin;
          logger.debug("PROXY", `${origin}: Socket ${request.wid} disconnected`);
          request.terminate();
          setRateLimit(origin, "removeSession", void 0, request.wid);
          proxy.sockets.delete(socket);
        })();
      });
    } catch {
      socket.terminate();
    }
  }
  await app.register(cors.fastifyCors, {
    // Allow all origins (for development)
    origin: true,
    // For production, specify: origin: ['https://your-frontend.com']
    maxAge: 1728e3
  });
  await app.register(websocket.fastifyWebsocket, {
    options: {
      maxPayload: config.maxBodySize
    }
  });
  if (config.swaggerApi) {
    const { protocol, host } = new URL(config.swaggerApi);
    app.register(fastifySwagger, {
      swagger: {
        info: {
          title: pkgJson.name,
          description: pkgJson.description,
          version: pkgJson.version
        },
        host,
        schemes: [protocol.replaceAll(":", "")],
        consumes: ["application/json"],
        produces: ["application/json"]
      }
    });
    const logoExists = await existsAsync(path.join(swaggerUiDir, "./logo.svg"));
    await app.register(fastifySwaggerUi, {
      routePrefix: "/docs",
      baseDir: logoExists ? swaggerUiDir : void 0,
      logo: logoExists ? {
        type: "image/svg+xml",
        content: await promises.readFile(path.join(swaggerUiDir, "./logo.svg"))
      } : void 0
    });
  }
  app.route({
    method: "GET",
    url: "/",
    handler: (_, reply) => {
      if (config.redirect) {
        reply.redirect(config.redirect);
        return;
      }
      reply.send("RPC Proxy Server");
    }
  });
  for (const [chain, backends] of Object.entries(config.backendGroup)) {
    app.post(
      `/${chain}`,
      {
        schema: {
          description: "Listen / Forward ETH JSONRPC POST requests",
          summary: "JSONRPC handler",
          body: JsonRpcReqSchema,
          response: {
            200: JsonRpcRespSchema
          }
        }
      },
      (req, reply) => {
        handleReq(req, reply, backends[0]);
      }
    );
    app.get(
      `/${chain}/health`,
      {
        schema: {
          description: "Health checking endpoint for JSONRPC backend",
          summary: "Health handler",
          response: {
            200: BlockRespSchema,
            502: ErrorObjectSchema
          }
        }
      },
      (req, reply) => {
        handleHealth(req, reply, backends[0]);
      }
    );
    app.route({
      method: "GET",
      url: `/${chain}`,
      handler: (_, reply) => {
        if (config.redirect) {
          reply.redirect(config.redirect);
          return;
        }
        reply.send("RPC Proxy Server");
      },
      wsHandler: (socket, req) => {
        handleWS(socket, req, backends[0]);
      }
    });
    if (forkId === 0) {
      logger.debug("ROUTER", `Router 0 Listening on /${chain}`);
    }
  }
  app.listen({ port: config.port, host: config.host }, (err, address) => {
    if (err) {
      logger.error(`ROUTER ${forkId}`, "Error from router");
      console.log(err);
      process$1.exit(1);
    }
    logger.debug("ROUTER", `Router ${forkId} listening on ${address}`);
  });
  setInterval(async () => {
    for (const socket of proxy.sockets.values()) {
      try {
        const request = await socket.request;
        if (!request.checked) {
          socket.terminate();
          proxy.sockets.delete(socket);
          return;
        }
        request.checked = false;
        socket.ping();
      } catch {
      }
    }
  }, 60 * 1e3);
}
class Proxy {
  config;
  logger;
  app;
  reqSchema;
  forkId;
  sockets;
  msgQueue;
  constructor(config, forkId = 0) {
    this.config = config;
    this.logger = new loggerChain.Logger(config);
    this.app = fastify.fastify({
      ajv: {
        customOptions: {
          allowUnionTypes: true
        }
      },
      bodyLimit: config.maxBodySize,
      trustProxy: config.reverseProxy
    });
    this.reqSchema = new ajv.Ajv({ allowUnionTypes: true }).compile(JsonRpcReqSchema);
    this.forkId = forkId;
    this.sockets = /* @__PURE__ */ new Set();
    this.msgQueue = [];
    initProxy(this);
  }
}

class RateLimiter {
  config;
  logger;
  // Counter for rate limits (reset on every configured interval)
  counts;
  allCounts;
  allLimits;
  // Counter for sessions (ws) (reset on every day)
  sessions;
  constructor(config) {
    this.config = config;
    this.logger = new loggerChain.Logger(config);
    this.counts = {};
    this.allCounts = 0;
    this.allLimits = 0;
    this.sessions = {};
    setInterval(() => {
      this.logger.info(
        "PROXY",
        `Reqs: ${this.allCounts} ( ${Math.floor(this.allCounts / config.interval)} req/s ), Limits: ${this.allLimits}, Users: ${Object.keys(this.counts).length}, Conns: ${Object.keys(this.sessions).length}`
      );
      this.counts = {};
      this.allCounts = 0;
      this.allLimits = 0;
    }, config.interval * 1e3);
    setInterval(() => {
      this.sessions = {};
    }, 86400 * 1e3);
  }
  addCount(key, count = 1) {
    if (!this.counts[key]) {
      this.counts[key] = 0;
    }
    this.counts[key] += count;
    this.allCounts += count;
    if (this.counts[key] > this.config.ratelimit) {
      this.allLimits += count;
      return false;
    }
    return true;
  }
  addSession(key, session) {
    if (!this.sessions[key]) {
      this.sessions[key] = /* @__PURE__ */ new Set();
    }
    if (!this.sessions[key].has(session)) {
      this.sessions[key].add(session);
    }
    if (this.sessions[key].size > this.config.concurrency) {
      return false;
    }
    return true;
  }
  removeSession(key, session) {
    if (this.sessions[key]?.has(session)) {
      this.sessions[key].delete(session);
    }
    if (!this.sessions[key]?.size) {
      delete this.sessions[key];
    }
    return true;
  }
}

exports.BasicRequest = BasicRequest;
exports.BlockRespSchema = BlockRespSchema;
exports.ErrorObjectSchema = ErrorObjectSchema;
exports.JsonRpcReqSchema = JsonRpcReqSchema;
exports.JsonRpcRespSchema = JsonRpcRespSchema;
exports.LastBlocks = LastBlocks;
exports.PostRequest = PostRequest;
exports.Proxy = Proxy;
exports.RateLimiter = RateLimiter;
exports.WebSocketRequest = WebSocketRequest;
exports.__dirname = __dirname$1;
exports.bytesToHex = bytesToHex;
exports.concatBytes = concatBytes;
exports.configSchema = configSchema;
exports.connectWSRpc = connectWSRpc;
exports.createID = createID;
exports.digest = digest;
exports.existsAsync = existsAsync;
exports.filterGetLogParam = filterGetLogParam;
exports.filterGetLogs = filterGetLogs;
exports.filterRequest = filterRequest;
exports.filterSet = filterSet;
exports.getConfig = getConfig;
exports.hashOrigin = hashOrigin;
exports.hexToBytes = hexToBytes;
exports.initProxy = initProxy;
exports.markError = markError;
exports.markNewError = markNewError;
exports.rBytes = rBytes;
exports.rangeSet = rangeSet;
exports.refreshBlocks = refreshBlocks;
exports.rewriteTag = rewriteTag;
exports.sendWS = sendWS;
exports.subscribeSet = subscribeSet;
exports.swaggerUiDir = swaggerUiDir;
exports.textEncoder = textEncoder;
exports.traceSet = traceSet;
exports.whitelistedSet = whitelistedSet;
