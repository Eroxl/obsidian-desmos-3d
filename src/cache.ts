import { CacheLocation } from "./settings";

export interface StorageAdapter {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
}

export interface CacheConfig {
    enabled: boolean;
    location: CacheLocation;
    directory?: string;
    pluginId: string;
}

export interface GraphCache {
    getGraphImage(hash: string, ext: "svg" | "png"): Promise<string | null>;
    cacheGraphImage(hash: string, ext: "svg" | "png", data: string): Promise<void>;

    getState(hash: string): Promise<string | null>;
    putState(hash: string, state: string): Promise<void>;

    getDesmosApi(): Promise<string>;
}

const API_VERSION = "v1.11";
const API_URL = `https://www.desmos.com/api/${API_VERSION}/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6`;

export function createGraphCache(
    config: CacheConfig,
    storage: StorageAdapter,
    fetchFn: (url: string) => Promise<string>,
): GraphCache {
    const imageCache: Record<string, string> = {};
    const stateCache: Record<string, string> = {};
    let apiCache: string | null = null;

    const vendorDir = `.obsidian/plugins/${config.pluginId}/vendor`;
    const vendorFile = `${vendorDir}/desmos.js`;

    function graphFilePath(hash: string, ext: "svg" | "png"): string | null {
        if (!config.directory) return null;
        return `${config.directory}/desmos-graph-${hash}.${ext}`;
    }

    function stateFilePath(hash: string): string | null {
        if (!config.directory) return null;
        return `${config.directory}/desmos-state-${hash}.json`;
    }

    async function ensureDirectory(dir: string): Promise<boolean> {
        if (await storage.exists(dir)) return true;

        try {
            await storage.mkdir(dir);
            return true;
        } catch {
            return false;
        }
    }

    return {
        async getGraphImage(hash: string, ext: "svg" | "png"): Promise<string | null> {
            if (!config.enabled) return null;
            if (config.location === CacheLocation.Memory) return imageCache[hash] ?? null;

            const path = graphFilePath(hash, ext);
            if (!path) return null;

            if (await storage.exists(path)) return await storage.read(path);

            return null;
        },

        async cacheGraphImage(hash: string, ext: "svg" | "png", data: string): Promise<void> {
            if (!config.enabled) return;

            if (config.location === CacheLocation.Memory) {
                imageCache[hash] = data;
                return;
            }

            const path = graphFilePath(hash, ext);
            if (!path || !config.directory) return;
            if (!(await ensureDirectory(config.directory))) return;

            await storage.write(path, data);
        },

        async getState(hash: string): Promise<string | null> {
            if (!config.enabled) return null;
            if (config.location === CacheLocation.Memory) return stateCache[hash] ?? null;

            const path = stateFilePath(hash);
            if (!path) return null;

            if (await storage.exists(path)) return await storage.read(path);

            return null;
        },

        async putState(hash: string, state: string): Promise<void> {
            if (!config.enabled) return;

            if (config.location === CacheLocation.Memory) {
                stateCache[hash] = state;
                return;
            }

            const path = stateFilePath(hash);
            if (!path || !config.directory) return;
            if (!(await ensureDirectory(config.directory))) return;

            await storage.write(path, state);
        },

        async getDesmosApi(): Promise<string> {
            // Layer 1: in-memory
            if (apiCache !== null) return apiCache;

            // Layer 2: vendor file on disk
            if (await storage.exists(vendorFile)) {
                apiCache = await storage.read(vendorFile);
                return apiCache;
            }

            // Layer 3: fetch from network and persist
            try {
                apiCache = await fetchFn(API_URL);

                await ensureDirectory(vendorDir);
                await storage.write(vendorFile, apiCache);

                return apiCache;
            } catch (err) {
                console.warn(err);
                throw new Error(
                    "Unable to locate or download the Desmos API. If you don't have an internet connection: try rendering a graph whilst connected. If you have an internet connection: you may be on an unsupported device, please open an issue at https://github.com/Nigecat/obsidian-desmos/"
                );
            }
        },
    };
}
