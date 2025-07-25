# RPC Proxy

Fast, Minimal Reverse RPC Proxy Server for EVM chains

## Highlights

- Fast: Built with [Fastify](https://fastify.io/) which could handle more inputs than any other routers

- Scalable: Built on nodejs's cluster API which splits workloads by core

- Strictly Typed: Written with TypeScript with careful typing

- Dependencyless: Unlike any other available proxies we don't require any external DB nor process managements. Simply starting the script will auto start multi threads.

- Privacy: Raw IP addresses nor browser information isn't saved nor printed on log by default, every session is managed by in-memory hash.

- Cross-platform: Runs on any machine where node.js or docker is supported.

## Requirements

- Node.js v20.x+ (See the [official node.js download page](https://nodejs.org/en/download))

- Docker with Docker Compose (When using docker deployments)

## Quickstart

### Installation

- Running via Docker Compose (Recommended)

```bash
  # Spawn a docker container
  $ docker compose up -d
  # Show docker logs
  $ docker compose logs -f
```

- Running via source code

```bash
  $ git clone https://github.com/cpuchain/rpc-proxy
  $ cd rpc-proxy
  $ yarn
  $ yarn start
```

### Configuration

See `./config.example.json` for available configuration environment values. (By default config file from `./config.json` will be used).

## todo

- [] multiple backend support for single chain
(currently only the first backend for same chain would be used)
(need to figure out connections with client -> same node without complexity)

- [] audit by third party

- [] some kind unit testing