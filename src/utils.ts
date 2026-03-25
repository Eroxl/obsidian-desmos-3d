export type Hash = string;

/** Calculate a unique SHA-256 hash for the given object */
export async function calculateHash<T>(val: T): Promise<Hash> {
    const data = new TextEncoder().encode(JSON.stringify(val));

    /* istanbul ignore if */
    if (typeof crypto !== "undefined") {
        const buffer = await crypto.subtle.digest("SHA-256", data);
        const raw = Array.from(new Uint8Array(buffer));
        // Convert binary hash to hex
        const hash = raw.map((b) => b.toString(16).padStart(2, "0")).join("");

        return hash;
    } else {
        // Use node `crypto` module as fallback when browser subtle crypto does not exist,
        // this primarily exists to allow tests to generate hashes, and will not function if used in the browser context
        const { createHash } = await import("crypto");
        return createHash("sha256").update(data).digest("hex");
    }
}

const COLOR_VARS = [
    "--color-red",
    "--color-orange",
    "--color-yellow",
    "--color-green",
    "--color-cyan",
    "--color-blue",
    "--color-purple",
    "--color-pink",
] as const;

/** Read the Obsidian color palette from CSS custom properties on the body element */
export function readObsidianColors(): Record<string, string> {
    const style = getComputedStyle(document.body);
    const colors: Record<string, string> = {};
    for (const v of COLOR_VARS) {
        const value = style.getPropertyValue(v).trim();
        if (value) colors[v.replace("--color-", "")] = value;
    }

    Object.keys(colors).forEach((key) => {
        colors[key] = colors[key].replace(/rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/, (_: string, r: string, g: string, b: string) => {
            return `#${[r, g, b].map((x) => parseInt(x).toString(16).padStart(2, "0")).join("")}`;
        });
    });
    
    return colors;
}

/** Unsafe cast method.
 *  Will transform the given type `F` into `T`,
 *      use only when you know this will be valid. */
export function ucast<F, T>(o: F): T {
    return o as unknown as T;
}
