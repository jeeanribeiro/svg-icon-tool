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

  it('keeps a symmetric margin with the padding option', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10V10H0Z"/></svg>';
    const { svg } = normalizeIcon(input, { size: 24, padding: 3 });
    // A square icon with padding 3 in a 24 box spans exactly 3..21.
    expect(svg).toContain('d="M3 3H21V21H3Z"');
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  it('throws NormalizeError when padding swallows the whole icon', () => {
    expect(() => normalizeIcon(fixture('path-basic.svg'), { size: 24, padding: 12 })).toThrow(
      NormalizeError,
    );
    expect(() => normalizeIcon(fixture('path-basic.svg'), { padding: -1 })).toThrow(NormalizeError);
  });

  it('rounds coordinates to three decimals by default', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L7 13L1 13Z"/></svg>';
    const { svg } = normalizeIcon(input);
    const d = /d="([^"]*)"/.exec(svg)?.[1] ?? '';
    for (const num of d.match(/-?\d*\.?\d+/g) ?? []) {
      const decimals = num.split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(3);
    }
  });

  it('honors a custom precision, including stroke lengths', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 1L8 14" stroke="#000" stroke-width="1.23456" stroke-dasharray="1 2.5"/>' +
      '</svg>';
    const { svg } = normalizeIcon(input, { precision: 1, strokePolicy: 'ignore' });
    const d = /d="([^"]*)"/.exec(svg)?.[1] ?? '';
    for (const num of d.match(/-?\d*\.?\d+/g) ?? []) {
      const decimals = num.split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(1);
    }
    const strokeWidth = /stroke-width="([^"]*)"/.exec(svg)?.[1] ?? '';
    expect((strokeWidth.split('.')[1] ?? '').length).toBeLessThanOrEqual(1);
    const dasharray = /stroke-dasharray="([^"]*)"/.exec(svg)?.[1] ?? '';
    for (const num of dasharray.split(' ')) {
      expect((num.split('.')[1] ?? '').length).toBeLessThanOrEqual(1);
    }
  });

  it('throws NormalizeError on an invalid precision', () => {
    expect(() => normalizeIcon(fixture('path-basic.svg'), { precision: 2.5 })).toThrow(
      NormalizeError,
    );
    expect(() => normalizeIcon(fixture('path-basic.svg'), { precision: -1 })).toThrow(
      NormalizeError,
    );
  });
});
