#!/usr/bin/env node

import fs from 'fs/promises';
import { parse, stringify } from 'svgson';
import svgpath from 'svgpath';
import bounds from 'svg-path-bounds';
import { Command } from 'commander';

const program = new Command();

program
  .name('svg-icon-tool')
  .description('CLI to square, center, resize SVG icons and scale stroke widths proportionally')
  .version('2.0.2')
  .argument('<input>', 'Input SVG file path')
  .argument('<output>', 'Output SVG file path')
  .option('-s, --size <number>', 'Target size in pixels (default: 24)', '24')
  .action(async (inputFile, outputFile, options) => {
    const targetSize = Number(options.size);
    if (!targetSize || targetSize <= 0) {
      console.error('❌ Invalid size:', options.size);
      process.exit(1);
    }

    try {
      const rawSvg = await fs.readFile(inputFile, 'utf8');
      const parsed = await parse(rawSvg);

      const pathNodes = [];
      const collectPaths = node => {
        if (node.name === 'path' && node.attributes?.d) {
          pathNodes.push(node);
        }
        node.children?.forEach(collectPaths);
      };
      collectPaths(parsed);

      if (pathNodes.length === 0) {
        console.warn('⚠️ No <path> elements found.');
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of pathNodes) {
        try {
          const d = node.attributes.d;
          const [x1, y1, x2, y2] = bounds(d);
          const sw = parseFloat(node.attributes['stroke-width'] || '0') || 0;
          const halfSw = sw / 2;
          minX = Math.min(minX, x1 - halfSw);
          minY = Math.min(minY, y1 - halfSw);
          maxX = Math.max(maxX, x2 + halfSw);
          maxY = Math.max(maxY, y2 + halfSw);
        } catch (e) {}
      }

      if (minX === Infinity) {
        console.error('❌ Could not compute bounding box.');
        process.exit(1);
      }

      const width = maxX - minX;
      const height = maxY - minY;
      const scale = targetSize / Math.max(width, height);
      const tx = -minX;
      const ty = -minY;
      const ox = (targetSize - width * scale) / 2;
      const oy = (targetSize - height * scale) / 2;

      for (const node of pathNodes) {
        node.attributes.d = svgpath(node.attributes.d)
          .translate(tx, ty)
          .scale(scale)
          .translate(ox, oy)
          .toString();
        const originalSw = parseFloat(node.attributes['stroke-width'] || '0');
        if (originalSw > 0) {
          node.attributes['stroke-width'] = (originalSw * scale).toString();
        }
        // Optional: enforce currentColor for consistency
        if (node.attributes.fill) {
          node.attributes.fill = 'currentColor';
        }
        if (node.attributes.stroke) {
          node.attributes.stroke = 'currentColor';
        }
      }

      parsed.attributes.viewBox = `0 0 ${targetSize} ${targetSize}`;
      parsed.attributes.width = String(targetSize);
      parsed.attributes.height = String(targetSize);

      const output = stringify(parsed);
      await fs.writeFile(outputFile, output);
      console.log(`✅ Saved: ${outputFile}`);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
