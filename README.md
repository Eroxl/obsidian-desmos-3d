# Obsidian 3D Graphing

A fork of [Obsidian Desmos](https://github.com/Nigecat/obsidian-desmos) that supports 3D graphing using [Desmos 3D](https://www.desmos.com/calculator/3d).

## Installation

1. Download the repository as a ZIP file and extract it.
2. Run `npm run build` to build the plugin.
3. Copy the `main.js`, `manifest.json` to your Obsidian plugins folder in their own folder (usually located at `~/.obsidian/plugins/`).
4. Enable the plugin in Obsidian's settings.

## Usage

Just create a new codeblock with the language set to `desmos-graph-3d` and write your Desmos 3D graphing code inside the codeblock same as the desmos 2d grapher. 

```typescript
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
```
