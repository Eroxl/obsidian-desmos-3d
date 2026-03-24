import { ucast, readObsidianColors } from "./utils";
import { renderError } from "./error";
import { GraphCache } from "./cache";
import { Settings } from "./settings";
import {
    DegreeMode,
    Graph,
    Graph2D,
    Graph3D,
    Equation,
    LineStyle,
    PointStyle,
} from "./graph";

/** Convert color keys to uppercase for Desmos API (e.g. { red: "#..." } → { RED: "#..." }) */
function toDesmosColors(colors: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(colors)) result[k.toUpperCase()] = v;
    return result;
}

/** Parse an SVG string into a DOM element */
function parseSVG(svg: string): HTMLElement {
    return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
}

/** Build Desmos expression strings from equations */
function buildExpressions(equations: Equation[]): string[] {
    const expressions: string[] = [];

    for (const equation of equations) {
        const expression: Record<string, unknown> = {
            color: equation.color,
            label: equation.label,
            hidden: equation.hidden,
            showLabel: equation.label !== undefined,
            lines: equation.line,
        };

        if (equation.restrictions) {
            const restriction = equation.restrictions
                .map((restriction) =>
                    `{${restriction}}`
                        .replaceAll("{", String.raw`\{`)
                        .replaceAll("}", String.raw`\}`)
                        .replaceAll("<=", String.raw`\leq `)
                        .replaceAll(">=", String.raw`\geq `)
                        .replaceAll("<", String.raw`\le `)
                        .replaceAll(">", String.raw`\ge `)
                )
                .join("");

            expression.latex = `${equation.equation}${restriction}`;
        } else {
            expression.latex = equation.equation;
        }

        if (equation.style) {
            if (Object.values(LineStyle).includes(ucast(equation.style))) {
                expression.lineStyle = equation.style;
            } else if (Object.values(PointStyle).includes(ucast(equation.style))) {
                expression.pointStyle = equation.style;
            }
        }

        expressions.push(`calculator.setExpression(JSON.parse(${JSON.stringify(JSON.stringify(expression))}));`);
    }

    return expressions;
}

/** Shared error observer snippet for iframe scripts */
function buildErrorObserver(expressions: string[], hash: string): string {
    return `
            if (${expressions.length > 0}) {
                calculator.observe("expressionAnalysis", () => {
                    for (const id in calculator.expressionAnalysis) {
                        const analysis = calculator.expressionAnalysis[id];
                        if (analysis.isError) {
                            parent.postMessage({ t: "desmos-graph", d: "error", o: "${
                                window.origin
                            }", data: analysis.errorMessage, hash: "${hash}" }, "${window.origin}");
                        }
                    }
                });
            }
    `;
}

/** Build the iframe body HTML for a 2D graph */
function buildIframeBody2D(graph: Graph2D, expressions: string[], hash: string, colors: Record<string, string>): string {
    const s = graph.settings;

    return `
        <div id="calculator-${hash}" style="width: ${s.width}px; height: ${s.height}px;"></div>
        <script>
            const options = {
                settingsMenu: false,
                lockViewport: true,
                trace: false,
                xAxisNumbers: ${!s.hideAxisNumbers},
                yAxisNumbers: ${!s.hideAxisNumbers},
                showGrid: ${s.grid},
                degreeMode: ${s.degreeMode === DegreeMode.Degrees},
                colors: ${JSON.stringify(toDesmosColors(colors))},
            };

            if (${s.xAxisLabel !== undefined}) {
                options.xAxisLabel = "${JSON.stringify(s.xAxisLabel ?? "").slice(1, -1)}";
            }

            if (${s.yAxisLabel !== undefined}) {
                options.yAxisLabel = "${JSON.stringify(s.yAxisLabel ?? "").slice(1, -1)}";
            }

            options.xAxisScale = "${s.xAxisLogarithmic ? "logarithmic" : "linear"}";
            options.yAxisScale = "${s.yAxisLogarithmic ? "logarithmic" : "linear"}";

            const element = document.getElementById("calculator-${hash}");

            const calculator = Desmos.GraphingCalculator(element, options);
            calculator.setMathBounds({
                left: ${s.left},
                right: ${s.right},
                top: ${s.top},
                bottom: ${s.bottom},
            });

            ${expressions.join("\n")}

            ${buildErrorObserver(expressions, hash)}

            calculator.asyncScreenshot({ showLabels: true, format: "svg", width: ${s.width}, height: ${s.height} }, (data) => {
                document.body.innerHTML = "";
                parent.postMessage({ t: "desmos-graph", d: "render", o: "${
                    window.origin
                }", data, hash: "${hash}" }, "${window.origin}");
            });
        </script>
    `;
}

/** Build the iframe body HTML for a 3D graph.
 *  3D uses WebGL — canvas is captured as PNG via toDataURL.
 *  preserveDrawingBuffer patch is applied in <head> before the Desmos API loads.
 *  Calculator state is captured for camera persistence across reloads.
 */
function buildIframeBody3D(graph: Graph3D, expressions: string[], hash: string, cachedState?: string): string {
    const s = graph.settings;

    const captureSnippet = `
            // When locked, wait for render to settle then capture the canvas as PNG
            let _captureTimer;
            function _captureCanvas() {
                clearTimeout(_captureTimer);
                _captureTimer = setTimeout(() => {
                    const canvas = el.querySelector(".dcg-webgl-canvas");
                    if (canvas) {
                        const data = canvas.toDataURL("image/png");
                        parent.postMessage({ t: "desmos-graph", d: "render-3d", o: "${window.origin}", data, hash: "${hash}" }, "${window.origin}");
                        
                        const state = JSON.stringify(calculator.getState());
                        parent.postMessage({ t: "desmos-graph", d: "state", o: "${window.origin}", data: state, hash: "${hash}" }, "${window.origin}");
                    }
                }, 1500);
            }
            calculator.observeEvent("change", _captureCanvas);
            _captureCanvas();
    `;

    return `
        <div id="calculator-${hash}" style="width: ${s.width}px; height: ${s.height}px;"></div>
        <script>
            const options = {
                settingsMenu: false,
                expressions: false,
                showGrid: ${s.showGrid},
                showAxis: ${s.showAxis},
                degreeMode: ${s.degreeMode === DegreeMode.Degrees},
            };

            if (${s.xAxisLabel !== undefined}) {
                options.xAxisLabel = "${JSON.stringify(s.xAxisLabel ?? "").slice(1, -1)}";
            }

            if (${s.yAxisLabel !== undefined}) {
                options.yAxisLabel = "${JSON.stringify(s.yAxisLabel ?? "").slice(1, -1)}";
            }

            if (${s.zAxisLabel !== undefined}) {
                options.zAxisLabel = "${JSON.stringify(s.zAxisLabel ?? "").slice(1, -1)}";
            }

            const el = document.getElementById("calculator-${hash}");
            const calculator = Desmos.Calculator3D(el, options);

            ${cachedState ? `calculator.setState(JSON.parse(${JSON.stringify(cachedState)}));` : expressions.join("\n")}

            ${buildErrorObserver(expressions, hash)}

            ${captureSnippet}
        </script>
    `;
}

interface RenderData {
    graph: Graph;
    el: HTMLElement;
    resolve: () => void;
}

export class Renderer {
    private readonly cache: GraphCache;
    private readonly settings: Settings;
    /** The set of graphs we are currently rendering, mapped by their hash */
    private rendering: Map<string, RenderData> = new Map();
    private active: boolean;

    public constructor(cache: GraphCache, settings: Settings) {
        this.cache = cache;
        this.settings = settings;
        this.active = false;
    }

    public activate() {
        if (!this.active) {
            window.addEventListener("message", this.handler.bind(this));
            this.active = true;
        }
    }

    public deactivate() {
        if (this.active) {
            window.removeEventListener("message", this.handler.bind(this));
            this.active = false;
        }
    }

    public async render(graph: Graph, el: HTMLElement): Promise<void> {
        const cssPatchContent = `
            .dcg-svg-background {
                background: transparent !important;
                fill: transparent !important;
            }
            .dcg-svg-axis-line {
                stroke: var(--text-muted) !important;
            }
            .dcg-svg-major-gridline {
                stroke: var(--text-muted) !important;
                stroke-width: 1px !important;
            }
            .dcg-svg-minor-gridline {
                stroke: var(--text-muted) !important;
                stroke-width: 0.5px !important;
            }
            .block-language-desmos-graph text {
                stroke: none;
                fill: var(--text-muted) !important;
            }
            .block-language-desmos-graph > svg, .block-language-desmos-graph > iframe {
                display: block;
                margin-left: auto;
                margin-right: auto;
                border: 1px solid var(--text-muted) !important;
            }
        `;
        document.getElementById('desmos-3d-styles')?.remove();
        const style = document.createElement("style");
        style.id = "desmos-3d-styles";
        style.textContent = cssPatchContent;
        document.head.appendChild(style);
        const cssPatch = `<style>${cssPatchContent}</style>`;

        const hash = await graph.hash();
        const is3D = graph.type === "3d";
        const cacheExt = is3D ? "png" : "svg";

        const cached = await this.cache.getGraphImage(hash, cacheExt);
        if (cached !== null && (!is3D || (is3D && graph.settings.locked))) {
            if (is3D) {
                const img = document.createElement("img");
                img.src = cached;
                img.className = "desmos-graph";
                img.width = graph.settings.width;
                img.height = graph.settings.height;
                el.appendChild(img);
            } else {
                el.appendChild(parseSVG(cached));
            }
            return;
        }

        if (!this.settings.renderer) {
            throw new Error(
                "Unable to render a new graph with the renderer disabled. Set the 'Renderer' option to true in the plugin config (requires filesystem caching) to allow rendering new graphs again. If you're trying to export, all graphs must be in the graph cache (meaning they must have been viewd before the renderer was disabled)."
            );
        }

        const expressions = buildExpressions(graph.equations);

        const ctxPatch = is3D ?  `<script>
            const _log = (msg) => parent.postMessage({ t: "desmos-log", msg }, "*");
            const _origGetContext = HTMLCanvasElement.prototype.getContext;
            
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                const ctx = _origGetContext.apply(this, [type, ...args]);
                
                ctx.preserveDrawingBuffer = true;

                if (!ctx) return ctx;
                return new Proxy(ctx, {
                    get(target, prop, receiver) {
                        const value = Reflect.get(target, prop, receiver);

                        if (prop === "fillRect") {
                            return function() {
                                ctx.globalAlpha = 0;
                                value.apply(target, arguments);
                                ctx.globalAlpha = 1;
                            };
                        }
                        if (prop === "clearColor") {
                            return function(r, g, b, a) {
                                if (r === 1 && g === 1 && b === 1 && a === 1) {
                                    return target.clearColor(0, 0, 0, 0);
                                }
                                return target.clearColor(r, g, b, a);
                            };
                        }
                        if (prop === "drawArrays") {
                            const GL_LINES = 1;
                            const GL_TRIANGLES = 4;
                            // Vertex counts for Desmos UI chrome (grid lines, axis decorations)
                            const GRID_OVERLAY_VERTICES = 852;
                            const AXIS_DECORATION_VERTICES = 708;

                            return function(mode, first, count) {
                                if ((mode === GL_TRIANGLES && (count === GRID_OVERLAY_VERTICES || count === AXIS_DECORATION_VERTICES)) || (mode === GL_LINES)) {
                                    return;
                                }
                                return value.call(target, mode, first, count);
                            };
                        }
                        if (typeof value === "function") {
                            return function(...fnArgs) {
                                return value.apply(target, fnArgs);
                            };
                        }
                        return value;
                    },
                    set(target, prop, value) {
                        _log("ctx." + String(prop) + " = " + JSON.stringify(value));
                        target[prop] = value;
                        return true;
                    }
                });
            };
        </script>` : "";

        const htmlHead = `<style> .dcg-pillbox-container, .dcg-graphpaper-branding { display: none !important; } .dcg-calculator-api-container-v1_11 .dcg-container { background: transparent !important; } </style>${ctxPatch}${cssPatch}<script id="desmos-api">${await this.cache.getDesmosApi()}</script>`;

        const colors = readObsidianColors();
        const cachedState = graph.type === "3d" ? await this.cache.getState(hash) : null;
        const htmlBody = graph.type === "2d"
            ? buildIframeBody2D(graph, expressions, hash, colors)
            : buildIframeBody3D(graph, expressions, hash, cachedState ?? undefined);

        const htmlSrc = `<html><head>${htmlHead}</head><body>${htmlBody}</body>`;

        const iframe = document.createElement("iframe");
        iframe.sandbox.add("allow-scripts");
        iframe.width = graph.settings.width.toString();
        iframe.height = graph.settings.height.toString();
        iframe.className = "desmos-graph desmos-graph-iframe";
        iframe.srcdoc = htmlSrc;

        if (graph.type === "3d" && graph.settings.locked) {
            const wrapper = document.createElement("div");
            wrapper.addClass("desmos-graph-lock-wrapper");
            wrapper.appendChild(iframe);

            const overlay = document.createElement("div");
            overlay.addClass("desmos-graph-lock-overlay");
            wrapper.appendChild(overlay);
        } else {
            el.appendChild(iframe);
        }

        return new Promise((resolve) => this.rendering.set(hash, { graph, el, resolve }));
    }

    private async handler(
        message: MessageEvent<{ t: string; d: string; o: string; data: string; state?: string; hash: string; msg?: string }>
    ): Promise<void> {
        if (message.data.o !== window.origin || message.data.t !== "desmos-graph") return;

        const renderState = this.rendering.get(message.data.hash);
        if (!renderState) {
            console.warn(`Got graph not in render list, this is probably a bug - ${JSON.stringify(this.rendering)}`);
            return;
        }

        if (message.data.d === "state") {
            await this.cache.putState(message.data.hash, message.data.data);
            return;
        }

        const { graph, el, resolve } = renderState;

        if (message.data.d === "error") {
            renderError(message.data.data, el, graph.potentialErrorHint?.view);
            resolve();
            this.rendering.delete(message.data.hash);
            return;
        }

        if (message.data.d !== "render" && message.data.d !== "render-3d") {
            this.rendering.delete(message.data.hash);
            return;
        }

        const { data } = message.data;
        const is3D = message.data.d === "render-3d";

        const canOverwriteImage = graph.type === "3d" ? graph.settings.locked : true;

        if (canOverwriteImage) {
            el.empty();

            if (is3D) {
                const img = document.createElement("img");
                img.src = data;
                img.className = "desmos-graph";
                img.width = graph.settings.width;
                img.height = graph.settings.height;
                el.appendChild(img);
            } else {
                const node = parseSVG(data);
                node.setAttribute("class", "desmos-graph");
                el.appendChild(node);
            }
        }

        // Cache the rendered graph before resolving so subsequent renders see the cache
        const hash = await graph.hash();
        const ext = is3D ? "png" : "svg";
        await this.cache.cacheGraphImage(hash, ext, data);

        resolve();
        this.rendering.delete(message.data.hash);
    }
}
