import { describe, expect, it } from 'vitest';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';

describe('warnings for unsupported content', () => {
  it('warns about <text> and <image> instead of dropping them silently', () => {
    const { svg, warnings } = normalizeIcon(fixture('unsupported.svg'));
    expect(warnings.some((w) => w.startsWith('<text>'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('<image>'))).toBe(true);
    // The text warning carries an actionable hint.
    expect(warnings.find((w) => w.startsWith('<text>'))).toContain('outlines');
    // Unsupported nodes are preserved, not destroyed.
    expect(svg).toContain('<text');
    expect(svg).toContain('<image');
    // The measurable path still normalizes.
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  it('warns about hidden elements it skips', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M0 0h40v40Z" fill="#000"/>' +
      '<path d="M-100 -100h1v1Z" display="none" fill="#000"/>' +
      '</svg>';
    const { warnings } = normalizeIcon(input);
    expect(warnings.some((w) => w.includes('hidden'))).toBe(true);
  });

  it('warns about broken path data and keeps going', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M8 8 THIS IS NOT PATH DATA"/>' +
      '<path d="M0 0h40v40Z" fill="#000"/>' +
      '</svg>';
    const { svg, warnings } = normalizeIcon(input);
    expect(warnings.length).toBeGreaterThan(0);
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  it('collects the failure reasons when nothing is measurable', () => {
    expect(() => normalizeIcon(fixture('only-text.svg'))).toThrow(/text/);
  });
});
