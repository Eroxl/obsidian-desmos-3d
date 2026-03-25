import { create, all } from "mathjs";
import { ucast, calculateHash, Hash } from "../utils";
import {
    Equation,
    Color,
    ColorConstant,
    LineStyle,
    PointStyle,
    DegreeMode,
    PotentialErrorHint,
    ParseResult,
} from "./interface";

const math = create(all, { number: "number" });

/** The maximum dimensions of a graph */
export const MAX_SIZE = 99999;

// --- Enum & Color Parsing ---

export function parseStringToEnum<V, T extends { [key: string]: V }>(obj: T, key: string): V | null {
    const objKey = Object.keys(obj).find((k) => k.toUpperCase() === key.toUpperCase());
    return objKey ? obj[objKey] : null;
}

export function parseColor(value: string, themeColors?: Record<string, string>): Color | null {
    if (value.startsWith("#")) {
        if (/^[0-9a-zA-Z]+$/.test(value.slice(1))) return value;
    }
    
    if (themeColors) {
        const themed = themeColors[value.toLowerCase()];
        if (themed) return themed;
    }
    
    return parseStringToEnum(ColorConstant, value);
}

// --- Source Splitting ---

export function splitSource(source: string): { settingsSection?: string; equationsSection: string } {
    const split = source.split("---");

    if (split.length > 2) {
        throw new SyntaxError("Too many graph segments, there can only be a singular  '---'");
    }

    return {
        settingsSection: split.length > 1 ? split[0] : undefined,
        equationsSection: split[split.length - 1],
    };
}

// --- Equation Parsing ---

export function parseEquation(eq: string, themeColors?: Record<string, string>): ParseResult<Equation> {
    let hint: PotentialErrorHint | undefined;

    const segments = eq
        .split("|")
        .map((segment) => segment.trim())
        .filter((segment) => segment !== "");

    const equation: Equation = { equation: ucast(segments.shift()) };

    for (const segment of segments) {
        const segmentUpperCase = segment.toUpperCase();

        if (segmentUpperCase === "HIDDEN") {
            equation.hidden = true;
            continue;
        }

        if (segmentUpperCase === "NOLINE") {
            equation.line = false;
            continue;
        }

        const style: LineStyle | PointStyle | null =
            parseStringToEnum(LineStyle, segmentUpperCase) ?? parseStringToEnum(PointStyle, segmentUpperCase);
        if (style) {
            if (!equation.style) {
                equation.style = style;
            } else {
                throw new SyntaxError(`Duplicate style identifiers detected: ${equation.style}, ${segment}`);
            }
            continue;
        }

        const color = parseColor(segment, themeColors);
        if (color) {
            if (!equation.color) {
                equation.color = color;
            } else {
                throw new SyntaxError(
                    `Duplicate color identifiers detected, each equation may only contain a single color code.`
                );
            }
            continue;
        }

        if (segmentUpperCase.startsWith("LABEL:")) {
            const label = segment.split(":").slice(1).join(":").trim();

            if (equation.label === undefined) {
                if (label === "") {
                    throw new SyntaxError(`Equation label must have a value`);
                } else {
                    equation.label = label;
                }
            } else {
                throw new SyntaxError(
                    `Duplicate equation labels detected, each equation may only contain a single label.`
                );
            }

            continue;
        }

        if (segmentUpperCase === "LABEL") {
            equation.label = "";
            continue;
        }

        if (segment.includes("\\")) {
            const view = document.createElement("span");
            const pre = document.createElement("span");
            pre.innerText = "You may have tried to use the LaTeX syntax in the graph restriction (";
            const inner = document.createElement("code");
            inner.innerText = segment;
            const post = document.createElement("span");
            post.append(
                "), please use some sort of an alternative (e.g ",
                Object.assign(document.createElement("code"), { textContent: "\\frac{1}{2}" }),
                " => ",
                Object.assign(document.createElement("code"), { textContent: "1/2" }),
                ") as this is not supported by Desmos.",
            );
            view.appendChild(pre);
            view.appendChild(inner);
            view.appendChild(post);
            hint = { view };
        }

        if (!equation.restrictions) {
            equation.restrictions = [];
        }

        equation.restrictions.push(segment);
    }

    return { data: equation, hint };
}

export function parseEquations(equationsSection: string, themeColors?: Record<string, string>): { equations: Equation[]; hint?: PotentialErrorHint } {
    let potentialErrorHint: PotentialErrorHint | undefined;

    const equations = equationsSection
        .split(/\r?\n/g)
        .filter((equation) => equation.trim() !== "")
        .map((eq) => parseEquation(eq, themeColors))
        .map((result) => {
            if (result.hint) {
                potentialErrorHint = result.hint;
            }
            return result.data;
        });

    return { equations, hint: potentialErrorHint };
}

// --- Settings Field Parsers ---

export function parseBooleanField(key: string, value: string | undefined): boolean {
    if (!value) return true;

    const lower = value.toLowerCase();
    if (lower !== "true" && lower !== "false") {
        throw new SyntaxError(
            `Field '${key}' requres a boolean value 'true'/'false' (omit a value to default to 'true')`
        );
    }
    return lower === "true";
}

export function parseExpressionField(key: string, value: string | undefined): number {
    if (value === undefined) throw new SyntaxError(`Field '${key}' must have a value`);
    return math.evaluate(value) as number;
}

export function parseStringField(key: string, value: string | undefined): string {
    if (value === undefined) throw new SyntaxError(`Field '${key}' must have a value`);
    return value;
}

export function parseDegreeModeField(value: string | undefined): DegreeMode {
    if (value === undefined) throw new SyntaxError(`Field 'degreeMode' must have a value`);

    const mode: DegreeMode | null = parseStringToEnum(DegreeMode, value);
    if (mode) return mode;

    throw new SyntaxError(`Field 'degreeMode' must be either 'radians' or 'degrees'`);
}

export function parseColorField(value: string | undefined, themeColors?: Record<string, string>): Color {
    if (value === undefined) throw new SyntaxError(`Field 'defaultColor' must have a value`);

    const color = parseColor(value, themeColors);
    if (color) return color;
    throw new SyntaxError(
        `Field 'defaultColor' must be either a valid hex code or one of: ${Object.keys(ColorConstant).join(", ")}`
    );
}

// --- Settings Entry Extraction ---

export function extractSettingsEntries(raw: string): Array<[string, string | undefined]> {
    const seen = new Set<string>();

    return raw
        .split(/[;\n]/g)
        .map((setting) => setting.trim())
        .filter((setting) => setting !== "")
        .map((setting) => {
            const parts = setting.split("=");
            if (parts.length > 2) {
                throw new SyntaxError(
                    `Too many segments, eaching setting must only contain a maximum of one '=' sign`
                );
            }

            const key = parts[0].trim();
            const value = parts.length > 1 ? parts[1].trim() : undefined;

            if (seen.has(key)) {
                throw new SyntaxError(`Duplicate key '${key}' not allowed`);
            }
            seen.add(key);

            return [key, value] as [string, string | undefined];
        });
}

// --- Default Color Application ---

export function applyDefaultColor(equations: Equation[], defaultColor?: Color, themeColors?: Record<string, string>): Equation[] {
    const palette = themeColors ? Object.values(themeColors) : [];

    return equations.map((equation, i) => {
        if (equation.color) return equation;
        const fallback = defaultColor ?? (palette.length > 0 ? palette[i % palette.length] : undefined);
        if (!fallback) return equation;
        return { ...equation, color: fallback };
    });
}

// --- Hash ---

export function makeHashFn(
    type: "2d" | "3d",
    equations: Equation[],
    settings: object
): () => Promise<Hash> {
    const promise = calculateHash({ type, equations, settings });
    return () => promise;
}
