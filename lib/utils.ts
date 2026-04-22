/**
 * Convert LaTeX delimiters for remark-math compatibility.
 * Converts `\[...\]` to `$$...$$` and `\(...\)` to `$...$`.
 */
export function preprocessLatex(content: string): string {
  return content
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');
}

/**
 * Convert a File to a base64 string (data URL without prefix).
 */
export async function fileToBase64(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  return new Promise<string>((resolve) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
  });
}

/**
 * Convert a File to a base64 data URL (full string including prefix).
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file as data URL"));
    };
  });
}

/**
 * Extract multiple choice options from question content.
 * Matches patterns like "A. option text" or "B、option text"
 */
export function extractOptions(content: string) {
  const options = [];
  const labels = ["A", "B", "C", "D", "E", "F"];

  for (const label of labels) {
    const regex = new RegExp(`${label}[\\.、]\\s*([^\\n]+)`, "i");
    const match = content.match(regex);
    if (match) {
      options.push({ label, content: match[1].trim() });
    }
  }

  return options.length > 0 ? options : undefined;
}

/**
 * Estimate reading time for text content.
 * Average reading speed: ~300 Chinese characters per minute or ~200 English words per minute.
 * Returns reading time in minutes (minimum 1 minute).
 */
export function estimateReadingTime(content: string): number {
  if (!content || content.trim().length === 0) {
    return 1;
  }

  // Count Chinese characters
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  
  // Count English words (approximate)
  const englishWords = content.split(/\s+/).filter(word => word.length > 0).length;
  
  // Calculate time: 300 Chinese chars/min or 200 English words/min
  const chineseTime = chineseChars / 300;
  const englishTime = englishWords / 200;
  
  // Use the maximum of the two (content might be mixed)
  const totalMinutes = Math.max(chineseTime, englishTime);
  
  // Minimum 1 minute
  return Math.max(1, Math.ceil(totalMinutes));
}
