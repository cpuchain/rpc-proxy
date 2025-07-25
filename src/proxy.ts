import { readFile } from 'fs/promises';
import process from 'process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { WebSocket } from 'ws';
import { Logger } from 'logger-chain';
import { fastify, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { fastifyWebsocket } from '@fastify/websocket';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { Ajv, ValidateFunction } from 'ajv';
import { pkgJson } from './pkgJson.js';
import { BackendConfig, Config } from './config.js';
import { BlockRespSchema, ErrorObjectSchema, JsonRpcReqSchema, JsonRpcRespSchema } from './schema.js';
import { JsonRpcReq, markNewError } from './request.js';
import { PostRequest } from './post.js';
import { createID, existsAsync } from './utils.js';
import { WebSocketRequest } from './ws.js';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const swaggerUiDir = path.join(__dirname, '../node_modules/@fastify/swagger-ui/static');

export type WebSocketWithRequest = WebSocket & { request: Promise<WebSocketRequest> };

export interface MsgAddCount {
    id: string;
    type: 'addCount';
    key: string;
    score: number;
}

export interface MsgSession {
    id: string;
    type: 'addSession' | 'removeSession';
    key: string;
    session: string;
}

export interface MsgBlockNumber {
    id: string;
    type: 'getBlockNumber';
    chain: string;
}

export type MsgRequest = MsgAddCount | MsgSession | MsgBlockNumber;

export interface MsgResult<T> {
    id: string;
    result: T;
}

export interface MsgQueue {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: (msg: any) => void;
    reject: (err: Error) => void;
    timeout?: NodeJS.Timeout;
    resolved: boolean;
}

export async function initProxy(proxy: Proxy) {
    const { config, logger, app, reqSchema, forkId } = proxy;

    // (thread) Consume messages sent from main thread
    process.on('message', (msg: MsgResult<boolean | number>) => {
        const queue = proxy.msgQueue.find((q) => q.id === msg.id);

        if (!queue) {
            return;
        }

        queue.resolve(msg.result);
        queue.resolved = true;

        proxy.msgQueue = proxy.msgQueue.filter((q) => !q.resolved);
    });

    // (thread) Send message to main thread
    function sendMessage<T>(msg: Omit<MsgRequest, 'id'>): Promise<T> {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            if (!process.send) {
                reject(new Error('Not cluster'));
                return;
            }

            const id = await createID();

            const queue = {
                id,
                resolve,
                reject,
                resolved: false,
            } as MsgQueue;

            // should solve on reconnection when the expected message is never received
            queue.timeout = setTimeout(() => {
                if (!queue.resolved) {
                    queue.reject(new Error('Request timeout'));
                    queue.resolved = true;
                }
            }, 10 * 1000);

            proxy.msgQueue.push(queue);

            process.send({
                id,
                ...msg,
            } as MsgRequest);
        });
    }

    // (thread) Send usage to main thread and receive boolean
    function setRateLimit(key: string, type: string, score?: number, session?: string): Promise<boolean> {
        return sendMessage<boolean>({
            type,
            key,
            score,
            session,
        } as Omit<MsgAddCount | MsgSession, 'id'>);
    }

    // (thread) Get latest known block number for backend
    function getBlockNumber(chain: string): Promise<number> {
        return sendMessage<number>({
            type: 'getBlockNumber',
            chain,
        } as Omit<MsgBlockNumber, 'id'>);
    }

    // (router) Handle POST requests
    async function handleReq(
        req: FastifyRequest,
        reply: FastifyReply,
        backend: BackendConfig,
    ): Promise<void> {
        try {
            const reqBody = req.body as JsonRpcReq | JsonRpcReq[];

            const request = new PostRequest({
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
        } catch {
            logger.debug('PROXY', 'Unknown POST error');
            reply.send(markNewError(undefined, 'Unknown POST error'));
        }
    }

    // (router) Handle /health GET requests
    async function handleHealth(
        req: FastifyRequest,
        reply: FastifyReply,
        backend: BackendConfig,
    ): Promise<void> {
        try {
            const request = new PostRequest({
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

            const isHealthy =
                Number(block?.timestamp || 0) + config.healthyAge > Math.floor(Date.now() / 1000);

            reply.code(isHealthy ? 200 : 502).send(block);
        } catch {
            logger.debug('PROXY', 'Unknown /health error');
            reply.code(502).send({ error: 'Unknown /health error' });
        }
    }

    // (router) Handle WebSocket requests
    function handleWS(socket: WebSocketWithRequest, req: FastifyRequest, backend: BackendConfig): void {
        try {
            if (!backend.wsUrl) {
                socket.send('WS backend unavailable');
                socket.terminate();
                return;
            }

            // (WebSocket) Init request object and save this as promise to receive all data before init
            if (!socket.request) {
                socket.request = (async () => {
                    const wid = await createID();

                    // (WebSocket) Init proxied WS connection to backend node
                    const request = new WebSocketRequest({
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
                        socket.send(JSON.stringify(markNewError(-32029, 'Connection limited')));
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

                        const parsedData = JSON.parse(
                            Buffer.isBuffer(e) ? e.toString() : (e as unknown as string),
                        ) as JsonRpcReq | JsonRpcReq[];

                        // Filter non JSONRPC 2.0 request
                        if (!reqSchema(parsedData)) {
                            logger.debug('FILTER', `${await request.hOrigin}: Invalid WS data`);
                            socket.send(JSON.stringify(markNewError(-32600, 'Invalid data')));
                            socket.terminate();
                            return;
                        }

                        socket.send(JSON.stringify(await request.send(parsedData)));
                    } catch {
                        logger.debug('PROXY', 'Unknown WS input data error');
                        socket.send(JSON.stringify(markNewError(undefined, 'Unknown WS input data error')));
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
        } catch {
            socket.terminate();
        }
    }

    // (router) Define CORS for requests from browser
    await app.register(fastifyCors, {
        // Allow all origins (for development)
        origin: true,
        // For production, specify: origin: ['https://your-frontend.com']
        maxAge: 1728000,
    });

    await app.register(fastifyWebsocket, {
        options: {
            maxPayload: config.maxBodySize,
        },
    });

    // (router) Enable swagger UI if enabled
    if (config.swaggerApi) {
        const { protocol, host } = new URL(config.swaggerApi);

        app.register(fastifySwagger, {
            swagger: {
                info: {
                    title: pkgJson.name,
                    description: pkgJson.description,
                    version: pkgJson.version,
                },
                host,
                schemes: [protocol.replaceAll(':', '')],
                consumes: ['application/json'],
                produces: ['application/json'],
            },
        });

        // temporary workout for swagger-ui to work with ./lib/start.js
        const logoExists = await existsAsync(path.join(swaggerUiDir, './logo.svg'));

        await app.register(fastifySwaggerUi, {
            routePrefix: '/docs',
            baseDir: logoExists ? swaggerUiDir : undefined,
            logo: logoExists
                ? {
                      type: 'image/svg+xml',
                      content: await readFile(path.join(swaggerUiDir, './logo.svg')),
                  }
                : undefined,
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
        app.post(
            `/${chain}`,
            {
                schema: {
                    description: 'Listen / Forward ETH JSONRPC POST requests',
                    summary: 'JSONRPC handler',
                    body: JsonRpcReqSchema,
                    response: {
                        200: JsonRpcRespSchema,
                    },
                },
            },
            (req, reply) => {
                handleReq(req, reply, backends[0]);
            },
        );

        app.get(
            `/${chain}/health`,
            {
                schema: {
                    description: 'Health checking endpoint for JSONRPC backend',
                    summary: 'Health handler',
                    response: {
                        200: BlockRespSchema,
                        502: ErrorObjectSchema,
                    },
                },
            },
            (req, reply) => {
                handleHealth(req, reply, backends[0]);
            },
        );

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
                handleWS(socket as WebSocketWithRequest, req, backends[0]);
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
            process.exit(1);
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
            } catch {}
        }
    }, 60 * 1000);
}

export class Proxy {
    config: Config;

    logger: Logger;
    app: FastifyInstance;
    reqSchema: ValidateFunction<boolean>;

    forkId: number;
    sockets: Set<WebSocketWithRequest>;
    msgQueue: MsgQueue[];

    constructor(config: Config, forkId = 0) {
        this.config = config;

        this.logger = new Logger(config);
        this.app = fastify({
            ajv: {
                customOptions: {
                    allowUnionTypes: true,
                },
            },
            bodyLimit: config.maxBodySize,
            trustProxy: config.reverseProxy,
        });
        this.reqSchema = new Ajv({ allowUnionTypes: true }).compile(JsonRpcReqSchema);

        this.forkId = forkId;
        this.sockets = new Set();
        this.msgQueue = [];

        initProxy(this);
    }
}
