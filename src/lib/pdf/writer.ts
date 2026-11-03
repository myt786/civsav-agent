import { deflateSync } from "node:zlib";

// A small PDF writer: text in the two built-in Helvetica faces, filled
// rectangles and lines, any number of pages. Enough for a branded report
// without a PDF package (and its fonts) in the bundle. Coordinates are
// from the top-left of the page, in points (1/72 inch).

export type Font = "regular" | "bold";
export type Rgb = [number, number, number];

// Adobe's published widths (per 1000 em) for ASCII 32–126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889,
  611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Characters outside ASCII that WinAnsi has, with their code and width.
const EXTRA: Record<string, [number, number]> = {
  "–": [0x96, 556],
  "—": [0x97, 1000],
  "‘": [0x91, 222],
  "’": [0x92, 222],
  "“": [0x93, 333],
  "”": [0x94, 333],
  "•": [0x95, 350],
  "…": [0x85, 1000],
  "€": [0x80, 556],
  "·": [0xb7, 278],
  "×": [0xd7, 584],
  "°": [0xb0, 400],
  "£": [0xa3, 556],
  "©": [0xa9, 737],
  "®": [0xae, 737],
  "≥": [0x3e, 584], // drawn as ">"
  "≤": [0x3c, 584],
  "→": [0x3e, 584],
  " ": [0x20, 278],
};

function encodeChar(ch: string): { code: number; width: (font: Font) => number } {
  const cp = ch.codePointAt(0) ?? 63;
  if (cp >= 32 && cp <= 126) {
    return { code: cp, width: (font) => (font === "bold" ? HELVETICA_BOLD : HELVETICA)[cp - 32] };
  }
  const extra = EXTRA[ch];
  if (extra) return { code: extra[0], width: () => extra[1] };
  // Latin-1 letters (é, ñ, ü...) are the same code in WinAnsi.
  if (cp >= 0xc0 && cp <= 0xff) return { code: cp, width: () => 556 };
  return { code: 63, width: (font) => (font === "bold" ? 611 : 556) }; // "?"
}

export function textWidth(text: string, font: Font, size: number): number {
  let units = 0;
  for (const ch of text) units += encodeChar(ch).width(font);
  return (units * size) / 1000;
}

function hexOf(text: string): string {
  let out = "";
  for (const ch of text) out += encodeChar(ch).code.toString(16).padStart(2, "0");
  return `<${out}>`;
}

// Word-wraps to a width; a single word longer than the line is broken.
export function wrapText(text: string, font: Font, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, font, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (textWidth(rest, font, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), font, size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function rgb(color: Rgb): string {
  return color.map((c) => num(c / 255)).join(" ");
}

export function hex(color: string): Rgb {
  const h = color.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export class PdfDocument {
  readonly width: number;
  readonly height: number;
  private pages: string[][] = [];

  constructor(width = 792, height = 612) {
    this.width = width;
    this.height = height;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): number {
    this.pages.push([]);
    return this.pages.length - 1;
  }

  private ops(page: number): string[] {
    const ops = this.pages[page];
    if (!ops) throw new Error(`No page ${page}`);
    return ops;
  }

  rect(page: number, x: number, y: number, w: number, h: number, fill: Rgb): void {
    this.ops(page).push(`${rgb(fill)} rg ${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re f`);
  }

  line(page: number, x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.5): void {
    this.ops(page).push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`);
  }

  // y is the text's baseline.
  text(page: number, x: number, y: number, text: string, opts: { size: number; font?: Font; color?: Rgb; align?: "left" | "right" | "center" }): void {
    const font = opts.font ?? "regular";
    const w = textWidth(text, font, opts.size);
    const left = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    this.ops(page).push(
      `BT /${font === "bold" ? "F2" : "F1"} ${num(opts.size)} Tf ${rgb(opts.color ?? [0, 0, 0])} rg ${num(left)} ${num(this.height - y)} Td ${hexOf(text)} Tj ET`,
    );
  }

  // Wrapped block starting with its first baseline at y; returns the y
  // just below the last line.
  paragraph(
    page: number,
    x: number,
    y: number,
    width: number,
    text: string,
    opts: { size: number; font?: Font; color?: Rgb; leading?: number; maxLines?: number },
  ): number {
    const font = opts.font ?? "regular";
    const leading = opts.leading ?? opts.size * 1.3;
    let lines = wrapText(text, font, opts.size, width);
    if (opts.maxLines && lines.length > opts.maxLines) {
      lines = lines.slice(0, opts.maxLines);
      lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s*\S{0,3}$/, "")}…`;
    }
    lines.forEach((line, i) => this.text(page, x, y + i * leading, line, { ...opts, font }));
    return y + lines.length * leading;
  }

  toBuffer(meta: { title?: string } = {}): Buffer {
    const objects: Buffer[] = [];
    const add = (body: Buffer | string) => {
      objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
      return objects.length; // object number
    };
    const catalogId = add(""); // placeholder, filled below
    const pagesId = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];
    for (const ops of this.pages) {
      const content = deflateSync(Buffer.from(ops.join("\n"), "latin1"));
      const contentId = add(
        Buffer.concat([
          Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
          content,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      );
    }
    objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
    objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");
    // The info dictionary isn't WinAnsi, so keep the title to plain ASCII.
    const title = (meta.title ?? "Report").replace(/[–—]/g, "-").replace(/[^\x20-\x7e]/g, "");
    const infoId = add(`<< /Title ${hexOf(title)} /Producer (civsav) >>`);

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let offset = chunks[0].length;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(offset);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      chunks.push(chunk);
      offset += chunk.length;
    });
    const xref = [
      "xref",
      `0 ${objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
      "trailer",
      `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>`,
      "startxref",
      String(offset),
      "%%EOF",
    ].join("\n");
    chunks.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(chunks);
  }
}
