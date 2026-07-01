export const COLOR_PREFIX_PATTERN = /^\{(#[0-9a-fA-F]{6})\}/;

export function normalizeHighlightColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : null;
}

export function postprocessColoredHighlightAsHtml(html: string): string {
  return html.replace(
    /<mark>\{(#[0-9a-fA-F]{6})\}([\s\S]*?)<\/mark>/g,
    (_full, rawColor: string, body: string) => {
      const color = normalizeHighlightColor(rawColor);
      if (!color) return `<mark>${body}</mark>`;
      return `<mark data-color="${color}" style="background-color: ${color}; color: inherit">${body}</mark>`;
    },
  );
}
