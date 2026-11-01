import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.cookienomster.steelseriesbatteryplugin.sdPlugin";
const nodeHidDirectory = path.resolve("node_modules/node-hid");
const pkgPrebuildsDirectory = path.resolve("node_modules/pkg-prebuilds");

function emitRuntimeFile(pluginContext, moduleName, moduleDirectory, relativePath) {
	pluginContext.emitFile({
		type: "asset",
		fileName: `node_modules/${moduleName}/${relativePath}`,
		source: fs.readFileSync(path.join(moduleDirectory, relativePath))
	});
}

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	external: ["node-hid"],
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-node-hid-runtime",
			generateBundle() {
				for (const relativePath of ["nodehid.js", "binding-options.js", "package.json", "LICENSE-bsd.txt"]) {
					emitRuntimeFile(this, "node-hid", nodeHidDirectory, relativePath);
				}
				for (const relativePath of ["package.json", "bindings.js", "LICENSE", "lib/prebuild.js"]) {
					emitRuntimeFile(this, "pkg-prebuilds", pkgPrebuildsDirectory, relativePath);
				}
				for (const prebuildDirectory of fs.readdirSync(path.join(nodeHidDirectory, "prebuilds"))) {
					if (!/^HID-(win32|darwin)-(x64|arm64|ia32)$/.test(prebuildDirectory)) {
						continue;
					}
					const nativeBinary = path.join("prebuilds", prebuildDirectory, "node-napi-v4.node");
					emitRuntimeFile(this, "node-hid", nodeHidDirectory, nativeBinary);
				}
			}
		},
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		}
	]
};

export default config;
