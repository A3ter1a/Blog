/**
 * Normalize Markdown heading markers
 * 
 * TipTap's Markdown extension outputs headings with one extra # marker.
 * For example:
 * - User creates H1 → TipTap outputs "## Heading" (should be "# Heading")
 * - User creates H2 → TipTap outputs "### Heading" (should be "## Heading")
 * 
 * This function removes one # from each heading to correct this.
 */
export function normalizeMarkdownHeadings(markdown: string): string {
  return markdown.replace(/^(#{2,6})\s+(.+)$/gm, (match, hashes, text) => {
    // Remove one # from the heading
    const correctedHashes = hashes.slice(1);
    return correctedHashes + ' ' + text;
  });
}
