export declare const textEncoder: import("util").TextEncoder;
export declare function concatBytes(...arrays: Uint8Array[]): Uint8Array;
export declare function bytesToHex(bytes: Uint8Array): string;
export declare function hexToBytes(hexString: string): Uint8Array;
export declare function rBytes(length?: number): Uint8Array;
export declare function digest(buf: Uint8Array, algorithm?: string): Promise<string>;
export declare function createID(): Promise<string>;
export declare function hashOrigin(ip: string): Promise<string>;
