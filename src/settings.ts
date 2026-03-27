import Desmos from "./main";
import { PluginSettingTab, App, Setting, Vault } from "obsidian";

export enum CacheLocation {
    Memory = "Memory",
    Filesystem = "Filesystem",
}

export interface Settings {
    /** The program version these settings were created in */
    version: string;
    /** Whether the renderer is enabled */
    renderer: boolean;
    cache: CacheSettings;
}

export interface CacheSettings {
    enabled: boolean;
    location: CacheLocation;
    directory?: string;
}

const DEFAULT_SETTINGS_STATIC: Omit<Settings, "version"> = {
    renderer: true,
    cache: {
        enabled: true,
        location: CacheLocation.Filesystem,
    },
};

/** Get the default settings for the given plugin. This simply uses `DEFAULT_SETTINGS_STATIC` and patches the version from the manifest. */
export function DEFAULT_SETTINGS(plugin: Desmos): Settings {
    const configPath = plugin.app.vault.configDir;

    if (configPath) {
        DEFAULT_SETTINGS_STATIC.cache.directory = `${configPath}/desmos-cache`;
    }

    return {
        version: plugin.manifest.version,
        ...DEFAULT_SETTINGS_STATIC,
    };
}

/** Attempt to migrate the given settings object to the current structure */
export function migrateSettings(plugin: Desmos, settings: Partial<Settings>): Settings {
    if (!Object.prototype.hasOwnProperty.call(settings, "renderer")) {
        settings.renderer = DEFAULT_SETTINGS_STATIC.renderer;
    }

    return settings as Settings;
}

export class SettingsTab extends PluginSettingTab {
    plugin: Desmos;

    constructor(app: App, plugin: Desmos) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Cache")
            .setDesc("Whether to cache the rendered graphs")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.cache.enabled).onChange(async (value) => {
                    this.plugin.settings.cache.enabled = value;
                    await this.plugin.saveSettings();

                    // Reset the display so the new state can render
                    this.display();
                })
            );

        if (this.plugin.settings.cache.enabled) {
            new Setting(containerEl)
                .setName("Cache location")
                .setDesc("Set the location to cache rendered graphs (note that memory caching is not persistent)")
                .addDropdown((dropdown) =>
                    dropdown
                        .addOption(CacheLocation.Memory, "Memory")
                        .addOption(CacheLocation.Filesystem, "Filesystem")
                        .setValue(this.plugin.settings.cache.location)
                        .onChange(async (value) => {
                            this.plugin.settings.cache.location = value as CacheLocation;
                            if (this.plugin.settings.cache.location !== CacheLocation.Filesystem) {
                                this.plugin.settings.renderer = true;
                            }
                            await this.plugin.saveSettings();

                            // Reset the display so the new state can render
                            this.display();
                        })
                );

            if (this.plugin.settings.cache.location === CacheLocation.Filesystem) {
                new Setting(containerEl)
                    .setName("Cache directory")
                    .setDesc(
                        `The directory to save cached graphs in, relative to the vault root (technical note: the graphs will be saved as \`desmos-graph-<hash>.svg\` where the name is a SHA-256 hash of the graph source). Also note that a lot of junk will be saved to this folder, you have been warned.`
                    )
                    .addText((text) => {
                        text.setValue(this.plugin.settings.cache.directory ?? "").onChange(async (value) => {
                            this.plugin.settings.cache.directory = value;
                            await this.plugin.saveSettings();
                        });
                    });

                new Setting(containerEl)
                    .setName("Renderer")
                    .setDesc(
                        "Whether to enable the graph renderer. Turning this off will prevent any new graphs from rendering, but will ensure all cached graphs are rendered instantly. If this is disabled, filesystem caching is recommended. This setting should be used for external exporting (such as to a website or PDF)."
                    )
                    .addToggle((toggle) =>
                        toggle.setValue(this.plugin.settings.renderer).onChange(async (value) => {
                            this.plugin.settings.renderer = value;
                            await this.plugin.saveSettings();

                            // Reset the display so the new state can render
                            this.display();
                        })
                    );
            }
        }
    }
}
