import { Graph2D, Graph2DSettings, DegreeMode } from "./interface";
import {
    splitSource,
    parseEquations,
    extractSettingsEntries,
    parseBooleanField,
    parseExpressionField,
    parseStringField,
    parseDegreeModeField,
    parseColorField,
    applyDefaultColor,
    makeHashFn,
    MAX_SIZE,
} from "./parse-common";

const DEFAULT_2D_SETTINGS: Graph2DSettings = {
    width: 600,
    height: 400,
    left: -10,
    right: 10,
    bottom: -7,
    top: 7,
    grid: true,
    degreeMode: DegreeMode.Radians,
    hideAxisNumbers: false,
    xAxisLogarithmic: false,
    yAxisLogarithmic: false,
};

const DEFAULT_GRAPH_WIDTH = Math.abs(DEFAULT_2D_SETTINGS.left) + Math.abs(DEFAULT_2D_SETTINGS.right);
const DEFAULT_GRAPH_HEIGHT = Math.abs(DEFAULT_2D_SETTINGS.bottom) + Math.abs(DEFAULT_2D_SETTINGS.top);

function parseSettings2D(raw: string): Partial<Graph2DSettings> {
    const settings: Partial<Graph2DSettings> = {};
    const entries = extractSettingsEntries(raw);

    for (const [key, value] of entries) {
        switch (key as keyof Graph2DSettings) {
            case "hideAxisNumbers":
            case "xAxisLogarithmic":
            case "yAxisLogarithmic":
            case "grid":
                (settings[key as "grid" | "hideAxisNumbers" | "xAxisLogarithmic" | "yAxisLogarithmic"] as boolean) =
                    parseBooleanField(key, value);
                break;

            case "xAxisLabel":
            case "yAxisLabel":
                settings[key as "xAxisLabel" | "yAxisLabel"] = parseStringField(key, value);
                break;

            case "top":
            case "bottom":
            case "left":
            case "right":
            case "width":
            case "height":
                (settings[key as "top" | "bottom" | "left" | "right" | "width" | "height"] as number) =
                    parseExpressionField(key, value);
                break;

            case "degreeMode":
                settings.degreeMode = parseDegreeModeField(value);
                break;

            case "defaultColor":
                settings.defaultColor = parseColorField(value);
                break;

            default:
                throw new SyntaxError(`Unrecognised field: ${key}`);
        }
    }

    return settings;
}

function adjustBounds(settings: Partial<Graph2DSettings>): void {
    if (
        settings.left !== undefined &&
        settings.right === undefined &&
        settings.left >= DEFAULT_2D_SETTINGS.right
    ) {
        settings.right = settings.left + DEFAULT_GRAPH_WIDTH;
    }
    if (
        settings.left === undefined &&
        settings.right !== undefined &&
        settings.right <= DEFAULT_2D_SETTINGS.left
    ) {
        settings.left = settings.right - DEFAULT_GRAPH_WIDTH;
    }
    if (
        settings.bottom !== undefined &&
        settings.top === undefined &&
        settings.bottom >= DEFAULT_2D_SETTINGS.top
    ) {
        settings.top = settings.bottom + DEFAULT_GRAPH_HEIGHT;
    }
    if (
        settings.bottom === undefined &&
        settings.top !== undefined &&
        settings.top <= DEFAULT_2D_SETTINGS.bottom
    ) {
        settings.bottom = settings.top - DEFAULT_GRAPH_HEIGHT;
    }
}

function validateSettings2D(settings: Graph2DSettings): void {
    if ((settings.width && settings.width > MAX_SIZE) || (settings.height && settings.height > MAX_SIZE)) {
        throw new SyntaxError(`Graph size outside of accepted bounds (must be <${MAX_SIZE}x${MAX_SIZE})`);
    }

    if (settings.left >= settings.right) {
        throw new SyntaxError(
            `Right boundary (${settings.right}) must be greater than left boundary (${settings.left})`
        );
    }
    if (settings.bottom >= settings.top) {
        throw new SyntaxError(`
                Top boundary (${settings.top}) must be greater than bottom boundary (${settings.bottom})
            `);
    }
}

export function parse2D(source: string): Graph2D {
    const { settingsSection, equationsSection } = splitSource(source);
    const { equations, hint } = parseEquations(equationsSection);
    const partialSettings = settingsSection ? parseSettings2D(settingsSection) : {};

    adjustBounds(partialSettings);
    const settings: Graph2DSettings = { ...DEFAULT_2D_SETTINGS, ...partialSettings };
    validateSettings2D(settings);

    return {
        type: "2d",
        equations: applyDefaultColor(equations, settings.defaultColor),
        settings,
        hash: makeHashFn("2d", equations, partialSettings),
        potentialErrorHint: hint,
    };
}
