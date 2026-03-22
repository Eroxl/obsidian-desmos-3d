import { Hash } from "../utils";

export interface PotentialErrorHint {
    view: HTMLSpanElement;
}

export interface ParseResult<T> {
    data: T;
    hint?: PotentialErrorHint;
}

export interface BaseGraphSettings {
    /** The width of the rendered graph */
    width: number;
    /** The height of the rendered graph */
    height: number;
    /** The degree mode to use for trigonometry functions, defaults to `radians` */
    degreeMode: DegreeMode;
    /** The default color to set all equations to.
     *  If this is not specified, each equation will be a random {@link ColorConstant} (assigned by Desmos).
     */
    defaultColor?: Color;
}

export interface Graph2DSettings extends BaseGraphSettings {
    /** The left bound of the graph */
    left: number;
    /** The right bound of the graph */
    right: number;
    /** The bottom bound of the graph */
    bottom: number;
    /** The top bound of the graph */
    top: number;
    /** Whether to show the grid or not, defaults to `true` */
    grid: boolean;
    /** Whether to hide all axis numbers, defaults to `false` */
    hideAxisNumbers: boolean;
    /** The label placed below x axis */
    xAxisLabel?: string;
    /** The label placed beside the y axis */
    yAxisLabel?: string;
    /** Whether the x-axis should be logarithmic, defaults to `false` */
    xAxisLogarithmic: boolean;
    /** Whether the y-axis should be logarithmic, defaults to `false` */
    yAxisLogarithmic: boolean;
}

export interface Graph3DSettings extends BaseGraphSettings {
    /** Whether to show the grid, defaults to `true` */
    showGrid: boolean;
    /** Whether to show the axes, defaults to `true` */
    showAxis: boolean;
    /** The label placed on the x axis */
    xAxisLabel?: string;
    /** The label placed on the y axis */
    yAxisLabel?: string;
    /** The label placed on the z axis */
    zAxisLabel?: string;
    /** Whether the graph is locked (prevents user interaction), defaults to `false` */
    locked: boolean;
}

export interface Graph2D {
    type: "2d";
    equations: Equation[];
    settings: Graph2DSettings;
    hash: () => Promise<Hash>;
    potentialErrorHint?: PotentialErrorHint;
}

export interface Graph3D {
    type: "3d";
    equations: Equation[];
    settings: Graph3DSettings;
    hash: () => Promise<Hash>;
    potentialErrorHint?: PotentialErrorHint;
}

export type Graph = Graph2D | Graph3D;

/** @deprecated Use Graph2DSettings instead */
export type GraphSettings = Graph2DSettings;

export enum DegreeMode {
    Radians = "RADIANS",
    Degrees = "DEGREES",
}

export interface Equation {
    equation: string;
    restrictions?: string[];
    style?: LineStyle | PointStyle;
    color?: ColorConstant | HexColor;
    hidden?: boolean;
    label?: string;
    line?: boolean;
}

export enum LineStyle {
    Solid = "SOLID",
    Dashed = "DASHED",
    Dotted = "DOTTED",
}

export enum PointStyle {
    Point = "POINT",
    Open = "OPEN",
    Cross = "CROSS",
}

export type Color = HexColor | ColorConstant;

export type HexColor = string;

export enum ColorConstant {
    Red = "#ff0000",
    Green = "#00ff00",
    Blue = "#0000ff",

    Yellow = "#ffff00",
    Magenta = "#ff00ff",
    Cyan = "#00ffff",

    Purple = "#6042a6",
    Orange = "#ffa500",
    Black = "#000000",
    White = "#ffffff",
}
