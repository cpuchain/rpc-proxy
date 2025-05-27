const { BannerPlugin } = require('webpack');
const path = require('path');

module.exports = [
    {
        target: 'node',
        mode: 'production',
        module: {
            rules: [
                {
                    test: /\.ts?$/,
                    loader: 'esbuild-loader',
                    options: {
                        loader: 'ts',
                        target: 'ES2022',
                    }
                }
            ]
        },
        entry: './src/start.ts',
        output: {
            filename: 'rpcProxy.js',
            path: path.resolve(__dirname, './lib'),
        },
        target: 'node',
        plugins: [
            new BannerPlugin({
                banner: '#!/usr/bin/env node\n',
                raw: true
            })
        ],
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
        },
        optimization: {
            minimize: false,
        },
    },
]