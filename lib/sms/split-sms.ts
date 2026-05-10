export type SplitSmsOptions = {
  maxChunk?: number;
  prefixBase?: string;
  finalRequiredLines?: string[];
};

const DEFAULT_MAX_CHUNK = 1200;

export function splitSms(text: string, options: SplitSmsOptions = {}): string[] {
  const maxChunk = options.maxChunk ?? DEFAULT_MAX_CHUNK;
  const normalized = normalizeAscii(text);

  if (normalized.length <= maxChunk) return [normalized];

  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  const finalRequiredLines = options.finalRequiredLines ?? [];
  const movableLines = lines.filter((line) => !finalRequiredLines.includes(line));
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of movableLines) {
    const next = [...current, line].join("\n");
    if (withPrefix(next, chunks.length + 1, 9, options.prefixBase).length <= maxChunk) {
      current.push(line);
      continue;
    }

    if (current.length) chunks.push(current.join("\n"));
    current = [line];
  }

  if (current.length) chunks.push(current.join("\n"));

  if (finalRequiredLines.length) {
    const finalLines = [...(chunks.pop()?.split("\n") ?? []), ...finalRequiredLines];
    chunks.push(finalLines.join("\n"));
  }

  const total = chunks.length;
  return chunks.map((chunk, index) => withPrefix(chunk, index + 1, total, options.prefixBase));
}

export function normalizeAscii(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function withPrefix(text: string, index: number, total: number, prefixBase = "Delta Report"): string {
  if (total <= 1) return text;
  return `${prefixBase} ${index}/${total}:\n${text}`;
}
