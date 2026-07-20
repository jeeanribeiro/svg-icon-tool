import './style.css';
import { normalizeIcon, NormalizeError, type NormalizeOptions } from '../src/index.js';
import clockSvg from '../docs/demo/clock.svg?raw';
import compassSvg from '../docs/demo/compass.svg?raw';
import boltSvg from '../docs/demo/bolt.svg?raw';
import arrowSvg from '../docs/demo/arrow.svg?raw';

const samples: Record<string, string> = {
  clock: clockSvg,
  compass: compassSvg,
  bolt: boltSvg,
  'send arrow': arrowSvg,
};

function must<T>(node: T | null, what: string): T {
  if (node === null) throw new Error(`missing ${what}`);
  return node;
}

function q(selector: string): HTMLElement {
  return must(document.querySelector<HTMLElement>(selector), selector);
}

const input = must(document.querySelector<HTMLTextAreaElement>('#input'), '#input');
const output = q('#output');
const warningsBox = q('#warnings');
const status = q('#status');
const previewBefore = q('#preview-before');
const previewAfter = q('#preview-after');
const copyButton = must(document.querySelector<HTMLButtonElement>('#copy'), '#copy');
const downloadButton = must(document.querySelector<HTMLButtonElement>('#download'), '#download');
const dropzone = q('#dropzone');
const samplesBox = q('#samples');

let lastResult = '';
let downloadName = 'icon.svg';

function fieldValue(id: string): string {
  return must(document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`), id).value;
}

function options(): NormalizeOptions {
  return {
    size: Number(fieldValue('opt-size')) || 24,
    padding: Number(fieldValue('opt-padding')) || 0,
    precision: Number(fieldValue('opt-precision')) || 3,
    colorMode: fieldValue('opt-color-mode') as NormalizeOptions['colorMode'],
    strokePolicy: fieldValue('opt-stroke-policy') as NormalizeOptions['strokePolicy'],
  };
}

function svgImage(svg: string): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = '';
  img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return img;
}

function setPreview(box: HTMLElement, svg: string | null): void {
  box.replaceChildren();
  if (svg !== null) box.append(svgImage(svg));
}

function setStatus(text: string, tone: 'idle' | 'ok' | 'error'): void {
  status.textContent = text;
  status.className =
    'w-full truncate rounded-md px-2 py-1.5 text-xs ' +
    (tone === 'ok' ? 'text-emerald-400' : tone === 'error' ? 'text-rose-400' : 'text-slate-500');
}

function render(): void {
  const raw = input.value.trim();
  warningsBox.classList.add('hidden');
  warningsBox.replaceChildren();

  if (raw === '') {
    output.innerHTML = '<span class="text-slate-600">normalized SVG appears here</span>';
    setPreview(previewBefore, null);
    setPreview(previewAfter, null);
    copyButton.disabled = true;
    downloadButton.disabled = true;
    setStatus('waiting for input', 'idle');
    return;
  }

  setPreview(previewBefore, raw);

  try {
    const result = normalizeIcon(raw, options());
    lastResult = result.svg;
    output.textContent = result.svg;
    setPreview(previewAfter, result.svg);
    copyButton.disabled = false;
    downloadButton.disabled = false;
    setStatus(result.changed ? 'normalized' : 'already normalized', 'ok');

    if (result.warnings.length > 0) {
      warningsBox.classList.remove('hidden');
      const title = document.createElement('p');
      title.className = 'mb-1 text-xs font-semibold text-amber-400';
      title.textContent = `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`;
      warningsBox.append(title);
      for (const warning of result.warnings) {
        const line = document.createElement('p');
        line.className = 'text-xs text-amber-200/80';
        line.textContent = warning;
        warningsBox.append(line);
      }
    }
  } catch (error) {
    setPreview(previewAfter, null);
    copyButton.disabled = true;
    downloadButton.disabled = true;
    const message = error instanceof NormalizeError ? error.message : String(error);
    output.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'text-rose-400';
    span.textContent = `error: ${message}`;
    output.append(span);
    setStatus('error', 'error');
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleRender(): void {
  clearTimeout(timer);
  timer = setTimeout(render, 150);
}

input.addEventListener('input', scheduleRender);
for (const id of [
  'opt-size',
  'opt-padding',
  'opt-precision',
  'opt-color-mode',
  'opt-stroke-policy',
]) {
  q(`#${id}`).addEventListener('input', scheduleRender);
}

copyButton.addEventListener('click', () => {
  void navigator.clipboard.writeText(lastResult).then(() => {
    copyButton.textContent = 'Copied!';
    setTimeout(() => (copyButton.textContent = 'Copy'), 1200);
  });
});

downloadButton.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([lastResult], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName.replace(/\.svg$/i, '') + '-normalized.svg';
  link.click();
  URL.revokeObjectURL(url);
});

// Drag and drop anywhere on the page.
for (const type of ['dragover', 'dragenter'] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.dataset.drag = 'true';
  });
}
for (const type of ['dragleave', 'dragend'] as const) {
  window.addEventListener(type, () => {
    dropzone.dataset.drag = 'false';
  });
}
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.dataset.drag = 'false';
  const file = event.dataTransfer?.files[0];
  if (file === undefined) return;
  downloadName = file.name;
  void file.text().then((text) => {
    input.value = text;
    render();
  });
});

// Sample buttons.
for (const [name, svg] of Object.entries(samples)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.className =
    'rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-sky-400 hover:text-white';
  button.addEventListener('click', () => {
    downloadName = `${name.replace(/\s+/g, '-')}.svg`;
    input.value = svg;
    render();
  });
  samplesBox.append(button);
}

render();
