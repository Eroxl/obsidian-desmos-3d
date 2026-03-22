import Desmos from "./main";
import { ucast } from "./utils";
import { renderError } from "./error";
import { CacheLocation } from "./settings";
import { normalizePath, Notice } from "obsidian";
import {
    DegreeMode,
    Graph,
    Graph2D,
    Graph3D,
    Equation,
    LineStyle,
    PointStyle,
} from "./graph";

/** Parse an SVG string into a DOM element */
function parseSVG(svg: string): HTMLElement {
    return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
}

/** Build Desmos expression strings from equations */
function buildExpressions(equations: Equation[]): string[] {
    const expressions: string[] = [];

    for (const equation of equations) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expression: any = {
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
function buildIframeBody2D(graph: Graph2D, expressions: string[], hash: string): string {
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
function buildIframeBody3D(graph: Graph3D, expressions: string[], hash: string): string {
    const s = graph.settings;

    return `
        <div id="calculator-${hash}" style="width: ${s.width}px; height: ${s.height}px;"></div>
        <script>
            const options = {
                settingsMenu: false,
                actions: false,
                zoomButtons: false,
                expressions: false,
                keypad: false,
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

            ${expressions.join("\n")}

            ${buildErrorObserver(expressions, hash)}
        </script>
    `;
}

interface RenderData {
    graph: Graph;
    el: HTMLElement;
    cacheFile?: string;
    resolve: () => void;
}

export class Renderer {
    private readonly plugin: Desmos;
    /** The set of graphs we are currently rendering, mapped by their hash */
    private rendering: Map<string, RenderData> = new Map();
    private active: boolean;

    public constructor(plugin: Desmos) {
        this.plugin = plugin;
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
        const plugin = this.plugin;
        const settings = plugin.settings;

        const hash = await graph.hash();

        let cacheFile: string | undefined;

        const is3D = graph.type === "3d";
        const cacheExt = is3D ? "png" : "svg";

        // If this graph is in the cache then fetch it
        if (settings.cache.enabled) {
            if (settings.cache.location === CacheLocation.Memory && hash in plugin.graphCache) {
                const data = plugin.graphCache[hash];
                if (!is3D) {
                    el.appendChild(parseSVG(data));
                    return;
                }
            } else if (settings.cache.location === CacheLocation.Filesystem && settings.cache.directory) {
                const adapter = plugin.app.vault.adapter;

                cacheFile = normalizePath(`${settings.cache.directory}/desmos-graph-${hash}.${cacheExt}`);
                if (await adapter.exists(cacheFile)) {
                    const data = await adapter.read(cacheFile);
                    if (!is3D) {
                        el.appendChild(parseSVG(data));
                        return;
                    }
                }
            }
        }

        if (!plugin.settings.renderer) {
            throw new Error(
                "Unable to render a new graph with the renderer disabled. Set the 'Renderer' option to true in the plugin config (requires filesystem caching) to allow rendering new graphs again. If you're trying to export, all graphs must be in the graph cache (meaning they must have been viewd before the renderer was disabled)."
            );
        }

        const expressions = buildExpressions(graph.equations);

        const ctxPatch = `<script>
            const _log = (msg) => parent.postMessage({ t: "desmos-log", msg }, "*");
            const _origGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                const ctx = _origGetContext.apply(this, [type, ...args]);
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
                            return function(mode, first, count) {
                                if ((mode === 4 && (count === 852 || count === 708)) || (mode === 1)) {
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
        </script>`;
        const htmlHead = `<style> .dcg-pillbox-container, .dcg-graphpaper-branding { display: none !important; } .dcg-calculator-api-container-v1_11 .dcg-container { background: transparent !important; } </style>${ctxPatch}<script id="desmos-api">${await plugin.tryCacheDesmosApi()}</script>`;

        const htmlBody = graph.type === "2d"
            ? buildIframeBody2D(graph, expressions, hash)
            : buildIframeBody3D(graph, expressions, hash);

        const htmlSrc = `<html><head>${htmlHead}</head><body>${htmlBody}</body>`;

        const iframe = document.createElement("iframe");
        iframe.sandbox.add("allow-scripts");
        iframe.width = graph.settings.width.toString();
        iframe.height = graph.settings.height.toString();
        iframe.className = "desmos-graph";
        iframe.style.border = "none";
        iframe.scrolling = "no";
        iframe.srcdoc = htmlSrc;

        if (graph.type === "3d" && graph.settings.locked) {
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";
            wrapper.style.display = "inline-block";
            wrapper.appendChild(iframe);

            const overlay = document.createElement("div");
            overlay.style.position = "absolute";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.cursor = "default";
            wrapper.appendChild(overlay);

            el.appendChild(wrapper);
        } else {
            el.appendChild(iframe);
        }

        return new Promise((resolve) => this.rendering.set(hash, { graph, el, resolve, cacheFile }));
    }

    private async handler(
        message: MessageEvent<{ t: string; d: string; o: string; data: string; state?: string; hash: string; msg?: string }>
    ): Promise<void> {
        if (message.data.t === "desmos-log") {
                console.log("[desmos-ctx]", message.data.msg);
                return;
            }
            if (message.data.o === window.origin && message.data.t === "desmos-graph") {
            const renderState = this.rendering.get(message.data.hash);
            if (renderState) {
                const { graph, el, resolve, cacheFile } = renderState;

                el.empty();

                if (message.data.d === "error") {
                    renderError(message.data.data, el, graph.potentialErrorHint?.view);
                    resolve();
                } else if (message.data.d === "render" || message.data.d === "render-3d") {
                    const { data } = message.data;
                    const is3D = message.data.d === "render-3d";

                    if (!is3D) {
                        const node = parseSVG(data);
                        node.setAttribute("class", "desmos-graph");
                        el.appendChild(node);
                    }
                    resolve();

                    const plugin = this.plugin;
                    const settings = plugin.settings;
                    const hash = await graph.hash();

                    // Cache the rendered image
                    if (settings.cache.enabled) {
                        if (settings.cache.location === CacheLocation.Memory) {
                            plugin.graphCache[hash] = data;
                        } else if (settings.cache.location === CacheLocation.Filesystem) {
                            const adapter = plugin.app.vault.adapter;

                            if (cacheFile && settings.cache.directory) {
                                if (await adapter.exists(settings.cache.directory)) {
                                    await adapter.write(cacheFile, data);
                                } else {
                                    new Notice(
                                        `desmos-graph: target cache directory '${settings.cache.directory}' does not exist, skipping cache`,
                                        10000
                                    );
                                }
                            } else {
                                new Notice(
                                    `desmos-graph: filesystem caching enabled but no cache directory set, skipping cache`,
                                    10000
                                );
                            }
                        }
                    }
                }

                this.rendering.delete(message.data.hash);
            } else {
                console.warn(
                    `Got graph not in render list, this is probably a bug - ${JSON.stringify(this.rendering)}`
                );
            }
        }
    }
}
