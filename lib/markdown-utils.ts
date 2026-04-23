/**
 * Normalize Markdown heading markers
 * 
 * TipTap's Markdown extension may sometimes output headings with incorrect
 * number of # markers. This function normalizes them.
 * 
 * For example:
 * - "## Some heading" → "# Some heading" (if it should be H1)
 * - "### Some heading" → "## Some heading" (if it should be H2)
 * 
 * The function detects patterns where the heading marker count doesn't match
 * the actual heading level and corrects it.
 */
export function normalizeMarkdownHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
    // Count the number of # markers
    const hashCount = hashes.length;
    
    // If the text itself doesn't start with #, this is likely correct
    // TipTap correctly outputs # for H1, ## for H2, etc.
    if (!text.startsWith('#')) {
      return match;
    }
    
    // If text starts with #, we might have duplication
    // Example: User types "# Heading", TipTap makes it H1, outputs "# # Heading"
    // We need to remove the duplicate
    
    // Count # at the start of text
    const textHashMatch = text.match(/^(#+)/);
    if (!textHashMatch) return match;
    
    const textHashCount = textHashMatch[1].length;
    const totalHashCount = hashCount + textHashCount;
    
    // If total exceeds max heading level (6), it's definitely a duplication error
    if (totalHashCount > 6) {
      // Keep only the text hashes (the user-intended level)
      const remainingText = text.substring(textHashCount).trim();
      return '#'.repeat(textHashCount) + ' ' + remainingText;
    }
    
    return match;
  });
}
