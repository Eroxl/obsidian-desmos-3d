import { Graph3D, Graph3DSettings, DegreeMode } from "./interface";
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

const DEFAULT_3D_SETTINGS: Graph3DSettings = {
    width: 600,
    height: 400,
    showGrid: true,
    showAxis: true,
    locked: false,
    degreeMode: DegreeMode.Radians,
};

function parseSettings3D(raw: string): Partial<Graph3DSettings> {
    const settings: Partial<Graph3DSettings> = {};
    const entries = extractSettingsEntries(raw);

    for (const [key, value] of entries) {
        switch (key as keyof Graph3DSettings) {
            case "showGrid":
            case "showAxis":
            case "locked":
                (settings[key as "showGrid" | "showAxis" | "locked"] as boolean) = parseBooleanField(key, value);
                break;

            case "xAxisLabel":
            case "yAxisLabel":
            case "zAxisLabel":
                settings[key as "xAxisLabel" | "yAxisLabel" | "zAxisLabel"] = parseStringField(key, value);
                break;

            case "width":
            case "height":
                (settings[key as "width" | "height"] as number) = parseExpressionField(key, value);
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

function validateSettings3D(settings: Graph3DSettings): void {
    if ((settings.width && settings.width > MAX_SIZE) || (settings.height && settings.height > MAX_SIZE)) {
        throw new SyntaxError(`Graph size outside of accepted bounds (must be <${MAX_SIZE}x${MAX_SIZE})`);
    }
}

export function parse3D(source: string): Graph3D {
    const { settingsSection, equationsSection } = splitSource(source);
    const { equations, hint } = parseEquations(equationsSection);
    const partialSettings = settingsSection ? parseSettings3D(settingsSection) : {};

    const settings: Graph3DSettings = { ...DEFAULT_3D_SETTINGS, ...partialSettings };
    validateSettings3D(settings);

    return {
        type: "3d",
        equations: applyDefaultColor(equations, settings.defaultColor),
        settings,
        hash: makeHashFn("3d", equations, partialSettings),
        potentialErrorHint: hint,
    };
}
