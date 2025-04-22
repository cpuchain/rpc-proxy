"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Proxy = void 0;
exports.initProxy = initProxy;
const promises_1 = require("fs/promises");
const process_1 = __importDefault(require("process"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const logger_1 = require("@cpuchain/logger");
const fastify_1 = require("fastify");
const cors_1 = require("@fastify/cors");
const websocket_1 = require("@fastify/websocket");
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const ajv_1 = __importDefault(require("ajv"));
const package_json_1 = __importDefault(require("../package.json"));
const schema_1 = require("./schema");
const request_1 = require("./request");
const post_1 = require("./post");
const utils_1 = require("./utils");
const ws_1 = require("./ws");
async function initProxy(proxy) {
    const { config, logger, app, reqSchema, forkId } = proxy;
    // (thread) Consume messages sent from main thread
    process_1.default.on('message', (msg) => {
        const queue = proxy.msgQueue.find((q) => q.id === msg.id);
        if (!queue) {
            return;
        }
        queue.resolve(msg.result);
        queue.resolved = true;
        proxy.msgQueue = proxy.msgQueue.filter((q) => !q.resolved);
    });
    // (thread) Send message to main thread
    function sendMessage(msg) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            if (!process_1.default.send) {
                reject(new Error('Not cluster'));
                return;
            }
            const id = await (0, utils_1.createID)();
            const queue = {
                id,
                resolve,
                reject,
                resolved: false,
            };
            // should solve on reconnection when the expected message is never received
            queue.timeout = setTimeout(() => {
                if (!queue.resolved) {
                    queue.reject(new Error('Request timeout'));
                    queue.resolved = true;
                }
            }, 10 * 1000);
            proxy.msgQueue.push(queue);
            process_1.default.send({
                id,
                ...msg,
            });
        });
    }
    // (thread) Send usage to main thread and receive boolean
    function setRateLimit(key, type, score, session) {
        return sendMessage({
            type,
            key,
            score,
            session,
        });
    }
    // (thread) Get latest known block number for backend
    function getBlockNumber(chain) {
        return sendMessage({
            type: 'getBlockNumber',
            chain,
        });
    }
    // (router) Handle POST requests
    async function handleReq(req, reply, backend) {
        try {
            const reqBody = req.body;
            const request = new post_1.PostRequest({
                maxBlockRange: config.maxBlockRange,
                backend,
                origin: req.ip,
                rateLimit: (origin, count) => {
                    return setRateLimit(origin, 'addCount', count);
                },
                blockFunc: (chain) => {
                    return getBlockNumber(chain);
                },
                logger,
            });
            reply.send(await request.send(reqBody));
        }
        catch {
            logger.debug('PROXY', 'Unknown POST error');
            reply.send((0, request_1.markNewError)(undefined, 'Unknown POST error'));
        }
    }
    // (router) Handle /health GET requests
    async function handleHealth(req, reply, backend) {
        try {
            const request = new post_1.PostRequest({
                maxBlockRange: config.maxBlockRange,
                backend,
                origin: req.ip,
                rateLimit: (origin, count) => {
                    return setRateLimit(origin, 'addCount', count);
                },
                blockFunc: (chain) => {
                    return getBlockNumber(chain);
                },
                logger,
            });
            const block = await request.getBlock();
            const isHealthy = Number(block?.timestamp || 0) + config.healthyAge > Math.floor(Date.now() / 1000);
            reply.code(isHealthy ? 200 : 502).send(block);
        }
        catch {
            logger.debug('PROXY', 'Unknown /health error');
            reply.code(502).send({ error: 'Unknown /health error' });
        }
    }
    // (router) Handle WebSocket requests
    function handleWS(socket, req, backend) {
        try {
            if (!backend.wsUrl) {
                socket.send('WS backend unavailable');
                socket.terminate();
                return;
            }
            // (WebSocket) Init request object and save this as promise to receive all data before init
            if (!socket.request) {
                socket.request = (async () => {
                    const wid = await (0, utils_1.createID)();
                    // (WebSocket) Init proxied WS connection to backend node
                    const request = new ws_1.WebSocketRequest({
                        wid,
                        maxBlockRange: config.maxBlockRange,
                        backend,
                        origin: req.ip,
                        rateLimit: (origin, count) => {
                            return setRateLimit(origin, 'addCount', count);
                        },
                        blockFunc: (chain) => {
                            return getBlockNumber(chain);
                        },
                        logger,
                    });
                    const origin = await request.hOrigin;
                    // (WebSocket) Limit on over concurrent websocket sessions
                    if (!(await setRateLimit(origin, 'addSession', undefined, wid))) {
                        logger.debug('LIMITED', `${origin}: Connection limited`);
                        socket.send(JSON.stringify((0, request_1.markNewError)(-32029, 'Connection limited')));
                        socket.terminate();
                        return request;
                    }
                    await request.connect();
                    logger.debug('PROXY', `${origin}: New socket ${wid} connected`);
                    proxy.sockets.add(socket);
                    request.onDisconnect = () => {
                        (async () => {
                            socket.terminate();
                            setRateLimit(origin, 'removeSession', undefined, wid);
                            proxy.sockets.delete(socket);
                        })();
                    };
                    request.onSubscribe = (data) => {
                        socket.send(JSON.stringify(data));
                    };
                    return request;
                })();
            }
            // (WebSocket) Deliver results and subscriptions
            socket.on('message', (e) => {
                (async () => {
                    try {
                        const request = await socket.request;
                        const parsedData = JSON.parse(Buffer.isBuffer(e) ? e.toString() : e);
                        // Filter non JSONRPC 2.0 request
                        if (!reqSchema(parsedData)) {
                            logger.debug('FILTER', `${await request.hOrigin}: Invalid WS data`);
                            socket.send(JSON.stringify((0, request_1.markNewError)(-32600, 'Invalid data')));
                            socket.terminate();
                            return;
                        }
                        socket.send(JSON.stringify(await request.send(parsedData)));
                    }
                    catch {
                        logger.debug('PROXY', 'Unknown WS input data error');
                        socket.send(JSON.stringify((0, request_1.markNewError)(undefined, 'Unknown WS input data error')));
                    }
                })();
            });
            // (WebSocket) Handle ping -> pong connection test
            socket.on('pong', () => {
                (async () => {
                    const request = await socket.request;
                    request.checked = true;
                })();
            });
            // (WebSocket) Terminate on client socket error (will also call close)
            socket.on('error', () => {
                (async () => {
                    const request = await socket.request;
                    socket.terminate();
                    request.terminate();
                    setRateLimit(await request.hOrigin, 'removeSession', undefined, request.wid);
                    proxy.sockets.delete(socket);
                })();
            });
            // (WebSocket) Client socket termination
            socket.on('close', () => {
                (async () => {
                    const request = await socket.request;
                    const origin = await request.hOrigin;
                    logger.debug('PROXY', `${origin}: Socket ${request.wid} disconnected`);
                    request.terminate();
                    setRateLimit(origin, 'removeSession', undefined, request.wid);
                    proxy.sockets.delete(socket);
                })();
            });
            // (WebSocket) Unexpected error, close socket :(
        }
        catch {
            socket.terminate();
        }
    }
    // (router) Define CORS for requests from browser
    app.register(cors_1.fastifyCors, () => (req, callback) => {
        callback(null, {
            origin: req.headers.origin || '*',
            credentials: true,
            methods: ['GET, POST, OPTIONS'],
            headers: [
                'DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type',
            ],
        });
    });
    await app.register(websocket_1.fastifyWebsocket, {
        options: {
            maxPayload: config.maxBodySize,
        },
    });
    // (router) Enable swagger UI if enabled
    if (config.swaggerApi) {
        const { protocol, host } = new URL(config.swaggerApi);
        app.register(swagger_1.default, {
            swagger: {
                info: {
                    title: package_json_1.default.name,
                    description: package_json_1.default.description,
                    version: package_json_1.default.version,
                },
                host,
                schemes: [protocol.replaceAll(':', '')],
                consumes: ['application/json'],
                produces: ['application/json'],
            },
        });
        // temporary workout for swagger-ui to work with ./lib/start.js
        let baseDir = path_1.default.join(process_1.default.cwd(), './node_modules/@fastify/swagger-ui/static');
        let logo = undefined;
        if ((0, fs_1.existsSync)(baseDir)) {
            logo = {
                type: 'image/svg+xml',
                content: await (0, promises_1.readFile)(path_1.default.join(baseDir, '/logo.svg')),
            };
        }
        else {
            baseDir = undefined;
        }
        await app.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            baseDir,
            logo,
        });
    }
    // (router) / handler
    app.route({
        method: 'GET',
        url: '/',
        handler: (_, reply) => {
            if (config.redirect) {
                reply.redirect(config.redirect);
                return;
            }
            reply.send('RPC Proxy Server');
        },
    });
    // (router) /${chain} handler
    for (const [chain, backends] of Object.entries(config.backendGroup)) {
        app.post(`/${chain}`, {
            schema: {
                description: 'Listen / Forward ETH JSONRPC POST requests',
                summary: 'JSONRPC handler',
                body: schema_1.JsonRpcReqSchema,
                response: {
                    200: schema_1.JsonRpcRespSchema,
                },
            },
        }, (req, reply) => {
            handleReq(req, reply, backends[0]);
        });
        app.get(`/${chain}/health`, {
            schema: {
                description: 'Health checking endpoint for JSONRPC backend',
                summary: 'Health handler',
                response: {
                    200: schema_1.BlockRespSchema,
                    502: schema_1.ErrorObjectSchema,
                },
            },
        }, (req, reply) => {
            handleHealth(req, reply, backends[0]);
        });
        app.route({
            method: 'GET',
            url: `/${chain}`,
            handler: (_, reply) => {
                if (config.redirect) {
                    reply.redirect(config.redirect);
                    return;
                }
                reply.send('RPC Proxy Server');
            },
            wsHandler: (socket, req) => {
                handleWS(socket, req, backends[0]);
            },
        });
        if (forkId === 0) {
            logger.debug('ROUTER', `Router 0 Listening on /${chain}`);
        }
    }
    // (router) Listen on port
    app.listen({ port: config.port, host: config.host }, (err, address) => {
        if (err) {
            logger.error(`ROUTER ${forkId}`, 'Error from router');
            console.log(err);
            process_1.default.exit(1);
        }
        logger.debug('ROUTER', `Router ${forkId} listening on ${address}`);
    });
    // (WebSocket) Test WebSocket connections
    // https://github.com/websockets/ws?tab=readme-ov-file#how-to-detect-and-close-broken-connections
    setInterval(async () => {
        for (const socket of proxy.sockets.values()) {
            try {
                const request = await socket.request;
                // Terminate idle sockets
                if (!request.checked) {
                    socket.terminate();
                    proxy.sockets.delete(socket);
                    return;
                }
                request.checked = false;
                socket.ping();
                // eslint-disable-next-line no-empty
            }
            catch { }
        }
    }, 60 * 1000);
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
        this.logger = (0, logger_1.factory)(config);
        this.app = (0, fastify_1.fastify)({
            ajv: {
                customOptions: {
                    allowUnionTypes: true,
                },
            },
            bodyLimit: config.maxBodySize,
            trustProxy: config.reverseProxy,
        });
        this.reqSchema = new ajv_1.default({ allowUnionTypes: true }).compile(schema_1.JsonRpcReqSchema);
        this.forkId = forkId;
        this.sockets = new Set();
        this.msgQueue = [];
        initProxy(this);
    }
}
exports.Proxy = Proxy;
