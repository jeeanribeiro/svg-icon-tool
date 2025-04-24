# svg-icon-tool

> 🧩 A simple CLI tool to **square**, **center**, and **resize** SVG icons to any size (default: `24x24`).

Ideal for icon design, icon libraries, and automation in design systems.

---

## ✨ Features

- 🔲 Squares and centers the SVG content
- 📐 Scales to fill the target size (`--size`, default: `24`)
- 📦 Outputs a clean `viewBox="0 0 size size"` SVG
- ⚙️ CLI-friendly and ready for automation

---

## 📦 Installation

### Global (recommended)

```bash
npm install -g svg-icon-tool
```

### Or use with `npx` (no install)

```bash
npx svg-icon-tool input.svg output.svg
```

---

## 🧪 Usage

```bash
svg-icon-tool <input> <output> [--size <number>]
```

### Examples

```bash
# Resize to default 24x24
svg-icon-tool icon.svg icon-24.svg

# Resize to 32x32
svg-icon-tool icon.svg icon-32.svg --size 32
```

---

## 🔧 Options

| Option      | Description                  | Default |
|-------------|------------------------------|---------|
| `--size`    | Target output size in pixels | `24`    |
| `--version` | Show CLI version             |         |
| `--help`    | Show usage help              |         |

---

## 📄 License

MIT — by [Jean Ribeiro](https://github.com/jeanribeiro)
