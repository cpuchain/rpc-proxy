"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textEncoder = void 0;
exports.concatBytes = concatBytes;
exports.bytesToHex = bytesToHex;
exports.hexToBytes = hexToBytes;
exports.rBytes = rBytes;
exports.digest = digest;
exports.createID = createID;
exports.hashOrigin = hashOrigin;
const crypto_1 = require("crypto");
exports.textEncoder = new TextEncoder();
function concatBytes(...arrays) {
    const totalSize = arrays.reduce((acc, e) => acc + e.length, 0);
    const merged = new Uint8Array(totalSize);
    arrays.forEach((array, i, arrays) => {
        const offset = arrays.slice(0, i).reduce((acc, e) => acc + e.length, 0);
        merged.set(array, offset);
    });
    return merged;
}
function bytesToHex(bytes) {
    return ('0x' +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''));
}
function hexToBytes(hexString) {
    if (hexString.slice(0, 2) === '0x') {
        hexString = hexString.slice(2);
    }
    if (hexString.length % 2 !== 0) {
        hexString = '0' + hexString;
    }
    return Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}
function rBytes(length = 32) {
    return crypto_1.webcrypto.getRandomValues(new Uint8Array(length));
}
async function digest(buf, algorithm = 'SHA-256') {
    return bytesToHex(new Uint8Array(await crypto_1.webcrypto.subtle.digest(algorithm, buf)));
}
async function createID() {
    return (await digest(concatBytes(rBytes(16), hexToBytes(Date.now().toString(16))), 'SHA-1')).substr(0, 18);
}
// Using partial hash to save memory
async function hashOrigin(ip) {
    return (await digest(exports.textEncoder.encode(ip), 'SHA-1')).substr(0, 18);
}
