/**
 * Strip Markdown and stray symbols so the browser's text-to-speech reads a reply
 * naturally instead of saying "asterisk asterisk one dot" for "**1.".
 */
export function cleanForSpeech(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')      // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // links → keep the text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')         // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2')         // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')            // italic
    .replace(/^\s*[-*+•]\s+/gm, '')             // bullet markers
    .replace(/^\s*\d+[.)]\s+/gm, '')            // numbered list markers "1. " / "1) "
    .replace(/[*_#`>~|]/g, '')                  // leftover markdown symbols
    .replace(/\n{2,}/g, '. ')                   // paragraph breaks → pause
    .replace(/\n/g, '. ')                        // line breaks → pause
    .replace(/\.\s*\.\s*(\.\s*)+/g, '. ')        // collapse repeated dots
    .replace(/\s{2,}/g, ' ')
    .trim();
}
