import { describe, expect, it } from 'vitest';
import { NormalizeError, normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';

describe('normalizeIcon', () => {
  it('squares, centers, and resizes a basic path icon', () => {
    const { svg, changed, warnings } = normalizeIcon(fixture('path-basic.svg'));
    expect(changed).toBe(true);
    expect(warnings).toEqual([]);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
    expect(svg).toMatchSnapshot();
  });

  it('respects the size option', () => {
    const { svg } = normalizeIcon(fixture('path-basic.svg'), { size: 32 });
    expect(svg).toContain('viewBox="0 0 32 32"');
  });

  it('throws NormalizeError on malformed input', () => {
    expect(() => normalizeIcon('not svg at all')).toThrow(NormalizeError);
  });

  it('throws NormalizeError when the root element is not <svg>', () => {
    expect(() => normalizeIcon('<div><p>hi</p></div>')).toThrow(NormalizeError);
  });

  it('throws NormalizeError when there is nothing measurable', () => {
    expect(() => normalizeIcon(fixture('only-text.svg'))).toThrow(NormalizeError);
  });

  it('throws NormalizeError on an invalid size', () => {
    expect(() => normalizeIcon(fixture('path-basic.svg'), { size: -1 })).toThrow(NormalizeError);
  });
});
