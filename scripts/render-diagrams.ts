#!/usr/bin/env npx tsx
/**
 * Pre-renders all Mermaid diagrams in docs-site/ MDX files using beautiful-mermaid.
 *
 * - Extracts ```mermaid code blocks from MDX files
 * - Renders each to SVG using beautiful-mermaid with dracula theme
 * - Saves SVGs to docs-site/images/diagrams/
 * - Replaces code blocks with <img> tags wrapped in a clickable Frame
 *
 * Usage: npx tsx scripts/render-diagrams.ts
 */

import { renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const DOCS_DIR = join(import.meta.dirname, "..", "docs-site");
const DIAGRAMS_DIR = join(DOCS_DIR, "images", "diagrams");
const MERMAID_REGEX = /```mermaid\n([\s\S]*?)```/g;

// Dracula theme to match our purple color scheme
const THEME = {
  ...THEMES["dracula"],
  transparent: true,
};

function findMdxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && entry !== "images" && entry !== "node_modules") {
      files.push(...findMdxFiles(full));
    } else if (entry.endsWith(".mdx")) {
      files.push(full);
    }
  }
  return files;
}

function diagramId(filePath: string, index: number): string {
  const rel = relative(DOCS_DIR, filePath).replace(/[\/\.]/g, "-").replace(/-mdx$/, "");
  return `${rel}-${index}`;
}

function main() {
  if (!existsSync(DIAGRAMS_DIR)) {
    mkdirSync(DIAGRAMS_DIR, { recursive: true });
  }

  const mdxFiles = findMdxFiles(DOCS_DIR);
  let totalRendered = 0;
  let totalFiles = 0;

  for (const filePath of mdxFiles) {
    let content = readFileSync(filePath, "utf-8");
    const matches = [...content.matchAll(MERMAID_REGEX)];
    if (matches.length === 0) continue;

    totalFiles++;
    let modified = content;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const mermaidCode = match[1].trim();
      const id = diagramId(filePath, i);
      const svgPath = join(DIAGRAMS_DIR, `${id}.svg`);
      const relativeSvgPath = `/images/diagrams/${id}.svg`;

      try {
        let svg = renderMermaidSVG(mermaidCode, THEME);

        // Make SVG responsive
        svg = svg
          .replace(/width="[^"]*"/, 'width="100%"')
          .replace(/height="[^"]*"/, 'height="auto"');

        writeFileSync(svgPath, svg, "utf-8");

        // Replace mermaid block with image (no Frame wrapper - our custom.js handles the overlay)
        const replacement = `<img className="diagram-expandable" src="${relativeSvgPath}" alt="${id}" style={{ width: '100%', cursor: 'pointer' }} />`;

        modified = modified.replace(match[0], replacement);
        totalRendered++;
        console.log(`  Rendered: ${id}.svg`);
      } catch (err) {
        console.error(`  ERROR rendering ${id}: ${err}`);
      }
    }

    if (modified !== content) {
      writeFileSync(filePath, modified, "utf-8");
    }
  }

  console.log(`\nDone: ${totalRendered} diagrams rendered across ${totalFiles} files`);
}

main();
