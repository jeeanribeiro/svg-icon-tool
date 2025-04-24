#!/usr/bin/env node

import fs from 'fs/promises';
import { parse, stringify } from 'svgson';
import svgpath from 'svgpath';
import bounds from 'svg-path-bounds';
import { Command } from 'commander';

const program = new Command();

program
  .name('svg-icon-tool')
  .description('CLI to square, center, and resize SVG icons, including stroke widths')
  .version('1.0.0')
  .argument('<input>', 'Input SVG file path')
  .argument('<output>', 'Output SVG file path')
  .option('-s, --size <number>', 'Target output size in pixels (default: 24)', '24')
  .action(async (inputFile, outputFile, options) => {
    const targetSize = Number(options.size);
    if (Number.isNaN(targetSize) || targetSize <= 0) {
      console.error('❌ Invalid --size value. It must be a positive number.');
      process.exit(1);
    }

    try {
      // Read and parse SVG
      const rawSvg = await fs.readFile(inputFile, 'utf8');
      const parsed = await parse(rawSvg);

      // Recursively collect <path> nodes
      const pathNodes = [];
      (function collect(node) {
        if (node.name === 'path' && node.attributes && node.attributes.d) {
          pathNodes.push(node);
        }
        node.children?.forEach(collect);
      })(parsed);

      if (pathNodes.length === 0) {
        console.warn('⚠️ No <path> elements found in SVG.');
      }

      // Compute bounding box including stroke widths
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const node of pathNodes) {
        try {
          // get raw path bounds
          const [x1, y1, x2, y2] = bounds(node.attributes.d);
          // include stroke width margin
          const sw = parseFloat(node.attributes['stroke-width'] || node.attributes.strokeWidth || 0) || 0;
          const half = sw / 2;
          const bx1 = x1 - half;
          const by1 = y1 - half;
          const bx2 = x2 + half;
          const by2 = y2 + half;
          minX = Math.min(minX, bx1);
          minY = Math.min(minY, by1);
          maxX = Math.max(maxX, bx2);
          maxY = Math.max(maxY, by2);
        } catch (err) {
          console.warn(`⚠️ Skipping invalid path: ${err.message}`);
        }
      }

      if (minX === Infinity) {
        console.error('❌ Unable to compute bounding box. Check your SVG path data.');
        process.exit(1);
      }

      // Calculate scale and offsets
      const width = maxX - minX;
      const height = maxY - minY;
      const maxDim = Math.max(width, height);
      const scale = targetSize / maxDim;
      const dx = -minX;
      const dy = -minY;
      const offsetX = (targetSize - width * scale) / 2;
      const offsetY = (targetSize - height * scale) / 2;

      // Transform each path
      for (const node of pathNodes) {
        node.attributes.d = svgpath(node.attributes.d)
          .translate(dx, dy)
          .scale(scale)
          .translate(offsetX, offsetY)
          .toString();
      }

      // Update root SVG attributes
      parsed.attributes.viewBox = `0 0 ${targetSize} ${targetSize}`;
      parsed.attributes.width = String(targetSize);
      parsed.attributes.height = String(targetSize);

      // Serialize and write output
      const outputContent = stringify(parsed);
      await fs.writeFile(outputFile, outputContent);
      console.log(`✅ Saved: ${outputFile}`);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
