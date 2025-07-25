import { stat } from 'fs/promises';
import { webcrypto as crypto } from 'crypto';

export const textEncoder = new TextEncoder();

export async function existsAsync(file: string) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalSize = arrays.reduce((acc, e) => acc + e.length, 0);
    const merged = new Uint8Array(totalSize);

    arrays.forEach((array, i, arrays) => {
        const offset = arrays.slice(0, i).reduce((acc, e) => acc + e.length, 0);
        merged.set(array, offset);
    });

    return merged;
}

export function bytesToHex(bytes: Uint8Array): string {
    return (
        '0x' +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    );
}

export function hexToBytes(hexString: string): Uint8Array {
    if (hexString.slice(0, 2) === '0x') {
        hexString = hexString.slice(2);
    }
    if (hexString.length % 2 !== 0) {
        hexString = '0' + hexString;
    }
    return Uint8Array.from((hexString.match(/.{1,2}/g) as string[]).map((byte) => parseInt(byte, 16)));
}

export function rBytes(length = 32): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

export async function digest(buf: Uint8Array, algorithm = 'SHA-256'): Promise<string> {
    return bytesToHex(new Uint8Array(await crypto.subtle.digest(algorithm, buf)));
}

export async function createID(): Promise<string> {
    return (await digest(concatBytes(rBytes(16), hexToBytes(Date.now().toString(16))), 'SHA-1')).substr(
        0,
        18,
    );
}

// Using partial hash to save memory
export async function hashOrigin(ip: string): Promise<string> {
    return (await digest(textEncoder.encode(ip), 'SHA-1')).substr(0, 18);
}
