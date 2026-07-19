import { describe, expect, it } from 'vitest';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';

const input =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="#333">' +
  '<g stroke="#e11d48">' +
  '<path d="M0 0h40v20Z" fill="#0ea5e9"/>' +
  '<path d="M0 40h40v-10Z" fill="none" stroke-width="2"/>' +
  '</g></svg>';

describe('colorMode', () => {
  it('rewrites every explicit paint to currentColor by default', () => {
    const { svg } = normalizeIcon(input);
    expect(svg).not.toContain('#0ea5e9');
    expect(svg).not.toContain('#e11d48');
    expect(svg).not.toContain('#333');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('stroke="currentColor"');
    // fill="none" survives: it is structure, not color.
    expect(svg).toContain('fill="none"');
  });

  it('preserve keeps the original paints untouched', () => {
    const { svg } = normalizeIcon(input, { colorMode: 'preserve' });
    expect(svg).toContain('fill="#0ea5e9"');
    expect(svg).toContain('stroke="#e11d48"');
    expect(svg).not.toContain('currentColor');
  });

  it('warns when a gradient paint is flattened to currentColor', () => {
    const { svg, warnings } = normalizeIcon(fixture('gradient.svg'));
    expect(warnings.some((w) => w.includes('url(#sky)'))).toBe(true);
    expect(warnings.some((w) => w.includes('preserve'))).toBe(true);
    // The defs subtree is preserved verbatim either way.
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('stop-color="#0ea5e9"');
  });

  it('keeps gradient paints intact with preserve', () => {
    const { svg, warnings } = normalizeIcon(fixture('gradient.svg'), { colorMode: 'preserve' });
    expect(svg).toContain('fill="url(#sky)"');
    expect(warnings).toEqual([]);
  });

  it('rejects an unknown color mode', () => {
    expect(() => normalizeIcon(input, { colorMode: 'rainbow' as unknown as 'preserve' })).toThrow(
      /colorMode/,
    );
  });
});
