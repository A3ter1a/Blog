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
