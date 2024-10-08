import * as esbuild from "esbuild";

let ctx = await esbuild.context({
	entryPoints: ["src/index.ts"],
	bundle: true,
	minify: true,
	sourcemap: true,
	format: "esm",
	target: "esnext",
	outfile: "public/dist/bundle.js",
	loader: { ".svg": "text" },
});

let { port } = await ctx.serve({ servedir: "public" });
console.log(`Serving http://localhost:${port}/index.html`);
