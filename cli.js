#!/usr/bin/env node

import fs from 'fs/promises';
import { parse, stringify } from 'svgson';
import svgpath from 'svgpath';
import bounds from 'svg-path-bounds';
import { outlineSvg } from '@davestewart/outliner';
import { Command } from 'commander';

const program = new Command();

program
  .name('svg-icon-tool')
  .description('CLI to square, center, resize SVG icons with currentColor fill and stroke')
  .version('1.0.0')
  .argument('<input>', 'Input SVG file path')
  .argument('<output>', 'Output SVG file path')
  .option('-s, --size <number>', 'Target size in pixels (default: 24)', '24')
  .action(async (inputFile, outputFile, options) => {
    const targetSize = Number(options.size);
    if (Number.isNaN(targetSize) || targetSize <= 0) {
      console.error('❌ Invalid --size value. It must be a positive number.');
      process.exit(1);
    }

    try {
      const rawSvg = await fs.readFile(inputFile, 'utf8');
      const outlinedSvg = await outlineSvg(rawSvg, ['outline']);
      const parsed = await parse(outlinedSvg);

      const pathNodes = [];
      (function collect(node) {
        if (node.name === 'path' && node.attributes?.d) {
          pathNodes.push(node);
        }
        node.children?.forEach(collect);
      })(parsed);

      if (pathNodes.length === 0) {
        console.warn('⚠️ No <path> elements found after outlining strokes.');
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of pathNodes) {
        try {
          const [x1, y1, x2, y2] = bounds(node.attributes.d);
          minX = Math.min(minX, x1);
          minY = Math.min(minY, y1);
          maxX = Math.max(maxX, x2);
          maxY = Math.max(maxY, y2);
        } catch {
          // skip invalid paths
        }
      }

      if (minX === Infinity) {
        console.error('❌ Failed to compute bounding box.');
        process.exit(1);
      }

      const width = maxX - minX;
      const height = maxY - minY;
      const maxDim = Math.max(width, height);
      const scaleFactor = targetSize / maxDim;
      const translateX = -minX;
      const translateY = -minY;
      const offsetX = (targetSize - width * scaleFactor) / 2;
      const offsetY = (targetSize - height * scaleFactor) / 2;

      for (const node of pathNodes) {
        node.attributes.d = svgpath(node.attributes.d)
          .translate(translateX, translateY)
          .scale(scaleFactor)
          .translate(offsetX, offsetY)
          .toString();
        node.attributes.fill = 'currentColor';
        node.attributes.stroke = 'currentColor';
      }

      parsed.attributes.viewBox = `0 0 ${targetSize} ${targetSize}`;
      parsed.attributes.width = String(targetSize);
      parsed.attributes.height = String(targetSize);

      const finalSvg = stringify(parsed);
      await fs.writeFile(outputFile, finalSvg);
      console.log(`✅ Successfully saved ${outputFile}`);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
