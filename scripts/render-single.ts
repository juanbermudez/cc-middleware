import { renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const code = process.argv[2];
const outFile = process.argv[3];

if (!code || !outFile) {
  console.error("Usage: tsx scripts/render-single.ts '<mermaid code>' <output.svg>");
  process.exit(1);
}

let svg = renderMermaidSVG(code, { ...THEMES["dracula"], transparent: true });
svg = svg.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="auto"');
writeFileSync(outFile, svg);
console.log(`Rendered: ${outFile}`);
