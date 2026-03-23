import { parse2D, parse3D } from "./graph";
import { Plugin } from "obsidian";
import { Renderer } from "./renderer";
import { renderError } from "./error";
import { createGraphCache, GraphCache } from "./cache";
import { DEFAULT_SETTINGS, migrateSettings, Settings, SettingsTab } from "./settings";
import { readObsidianColors } from "./utils";

function handleError(err: unknown, el: HTMLElement): void {
    if (err instanceof Error) {
        renderError(err.message, el);
    } else if (typeof err === "string") {
        renderError(err, el);
    } else {
        renderError("Unexpected error - see console for debug log", el);
        console.error(err);
    }
}

export default class Desmos extends Plugin {
    settings!: Settings;
    renderer!: Renderer;
    cache!: GraphCache;

    async onload() {
        await this.loadSettings();

        this.cache = createGraphCache(
            { ...this.settings.cache, pluginId: this.manifest.id },
            {
                exists: (p) => this.app.vault.adapter.exists(p),
                read: (p) => this.app.vault.adapter.read(p),
                write: (p, d) => this.app.vault.adapter.write(p, d),
                mkdir: (p) => this.app.vault.adapter.mkdir(p),
            }
        );

        this.renderer = new Renderer(this.cache, this.settings);
        this.renderer.activate();

        this.addSettingTab(new SettingsTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("desmos-graph", async (source, el) => {
            try {
                const colors = readObsidianColors();
                const graph = parse2D(source, colors);
                await this.renderer.render(graph, el);
            } catch (err) {
                handleError(err, el);
            }
        });

        this.registerMarkdownCodeBlockProcessor("desmos-graph-3d", async (source, el) => {
            try {
                const colors = readObsidianColors();
                console.log(colors);
                const graph = parse3D(source, colors);
                await this.renderer.render(graph, el);
            } catch (err) {
                handleError(err, el);
            }
        });

        // Pre-warm the API cache (fire-and-forget)
        this.cache.getDesmosApi().catch(console.warn);
    }

    async unload() {
        this.renderer.deactivate();
    }

    async loadSettings() {
        let settings = await this.loadData();

        if (!settings) {
            settings = DEFAULT_SETTINGS(this);
        }
        if (settings.version !== this.manifest.version) {
            settings = migrateSettings(this, settings);
        }

        this.settings = settings;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
