import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import { ChatDoc, DocChunk, Source } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_FILES_PER_CHAT = 5;
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json'];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'this',
  'that', 'these', 'those', 'then', 'there', 'they', 'them', 'their', 'than'
]);

export interface ParsedPage {
  page: number | null;
  text: string;
}

export function validateFile(file: File, currentDocsCount: number): { valid: boolean; error?: string } {
  if (currentDocsCount >= MAX_FILES_PER_CHAT) {
    return { valid: false, error: `Maximum of ${MAX_FILES_PER_CHAT} files allowed per chat.` };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `${file.name} is larger than the 15 MB limit.` };
  }

  const name = file.name.toLowerCase();
  const hasValidExt = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasValidExt) {
    return {
      valid: false,
      error: `${file.name} has an unsupported format. Supported: .pdf, .docx, .txt, .md, .csv, .json`,
    };
  }

  return { valid: true };
}

export async function parseFileToPages(file: File): Promise<ParsedPage[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pages: ParsedPage[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      pages.push({ page: pageNum, text: pageText });
    }

    const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
    if (totalChars < 50) {
      throw new Error(`No readable text found in ${file.name}. It may be a scanned PDF.`);
    }

    return pages;
  }

  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value.trim();
    if (text.length < 10) {
      throw new Error(`No readable text found in ${file.name}.`);
    }
    return [{ page: null, text }];
  }

  // txt, md, csv, json
  const text = (await file.text()).trim();
  if (text.length === 0) {
    throw new Error(`File ${file.name} is empty.`);
  }
  return [{ page: null, text }];
}

/**
 * Chunks pages: ~1,500 characters per chunk with 200-character overlap,
 * never crossing a PDF page boundary. Number chunks per file (part).
 */
export function chunkPages(pages: ParsedPage[]): DocChunk[] {
  const chunks: DocChunk[] = [];
  let partNumber = 1;
  const CHUNK_SIZE = 1500;
  const OVERLAP = 200;

  for (const pageItem of pages) {
    const pageText = pageItem.text.trim();
    if (!pageText) continue;

    if (pageText.length <= CHUNK_SIZE) {
      chunks.push({
        text: pageText,
        page: pageItem.page,
        part: partNumber++,
      });
      continue;
    }

    let start = 0;
    while (start < pageText.length) {
      const end = Math.min(start + CHUNK_SIZE, pageText.length);
      const slice = pageText.slice(start, end).trim();
      if (slice) {
        chunks.push({
          text: slice,
          page: pageItem.page,
          part: partNumber++,
        });
      }
      if (end >= pageText.length) break;
      start += CHUNK_SIZE - OVERLAP;
    }
  }

  return chunks;
}

export async function processFile(file: File): Promise<ChatDoc> {
  const pages = await parseFileToPages(file);
  const chunks = chunkPages(pages);
  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: file.name,
    chars: totalChars,
    chunks,
  };
}

export interface RetrievedDocsResult {
  formattedContext: string;
  sources: Source[];
  wasTruncated: boolean;
  truncatedDocName?: string;
}

/**
 * Retrieval per Part E7:
 * - If all attached docs together are <= 40,000 characters -> send everything.
 * - Otherwise score each chunk: lowercase, split question into words, drop stopwords and words < 3 letters;
 *   score = sum over question words of occurrences in chunk + 3 bonus if whole question phrase appears.
 *   Take top chunks until 24,000 characters. If every score is 0, take first chunks of each doc up to budget.
 */
export function retrieveDocContext(docs: ChatDoc[], query: string): RetrievedDocsResult {
  if (docs.length === 0) {
    return { formattedContext: '', sources: [], wasTruncated: false };
  }

  const totalChars = docs.reduce((acc, d) => acc + d.chars, 0);
  const sourcesMap = new Map<string, Source>();

  // If <= 40,000 chars, send everything
  if (totalChars <= 40000) {
    const parts: string[] = [];
    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        const citation = chunk.page != null ? `[${doc.name}, p. ${chunk.page}]` : `[${doc.name}, part ${chunk.part}]`;
        parts.push(`${citation} ${chunk.text}`);

        const srcKey = `${doc.name}:${chunk.page ?? chunk.part}`;
        if (!sourcesMap.has(srcKey)) {
          sourcesMap.set(srcKey, {
            kind: 'doc',
            title: doc.name,
            page: chunk.page,
            snippet: chunk.text.slice(0, 160) + (chunk.text.length > 160 ? '...' : ''),
          });
        }
      }
    }
    return {
      formattedContext: `<documents>\n${parts.join('\n\n')}\n</documents>`,
      sources: Array.from(sourcesMap.values()),
      wasTruncated: false,
    };
  }

  // Need scoring & budget 24,000 chars
  const cleanQuery = query.toLowerCase();
  const queryWords = cleanQuery
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  interface ScoredChunk {
    docName: string;
    chunk: DocChunk;
    score: number;
  }

  const allChunks: ScoredChunk[] = [];
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      const lower = chunk.text.toLowerCase();
      let score = 0;
      if (cleanQuery.length > 3 && lower.includes(cleanQuery)) {
        score += 3;
      }
      for (const word of queryWords) {
        let idx = 0;
        let count = 0;
        while ((idx = lower.indexOf(word, idx)) !== -1) {
          count++;
          idx += word.length;
        }
        score += count;
      }
      allChunks.push({ docName: doc.name, chunk, score });
    }
  }

  const allZero = allChunks.every((c) => c.score === 0);
  let selected: ScoredChunk[] = [];

  if (allZero) {
    // Take the first chunks of each doc up to budget
    let budgetLeft = 24000;
    let round = 0;
    while (budgetLeft > 0) {
      let addedInRound = false;
      for (const doc of docs) {
        if (round < doc.chunks.length) {
          const chunk = doc.chunks[round];
          if (chunk.text.length <= budgetLeft) {
            selected.push({ docName: doc.name, chunk, score: 0 });
            budgetLeft -= chunk.text.length;
            addedInRound = true;
          }
        }
      }
      if (!addedInRound) break;
      round++;
    }
  } else {
    // Sort descending by score
    allChunks.sort((a, b) => b.score - a.score);
    let budgetLeft = 24000;
    for (const item of allChunks) {
      if (item.chunk.text.length <= budgetLeft) {
        selected.push(item);
        budgetLeft -= item.chunk.text.length;
      }
    }
    // Re-sort selected by original document order for coherence
    selected.sort((a, b) => {
      if (a.docName !== b.docName) return a.docName.localeCompare(b.docName);
      if (a.chunk.page != null && b.chunk.page != null) return a.chunk.page - b.chunk.page;
      return a.chunk.part - b.chunk.part;
    });
  }

  const parts: string[] = [];
  for (const item of selected) {
    const citation =
      item.chunk.page != null
        ? `[${item.docName}, p. ${item.chunk.page}]`
        : `[${item.docName}, part ${item.chunk.part}]`;
    parts.push(`${citation} ${item.chunk.text}`);

    const srcKey = `${item.docName}:${item.chunk.page ?? item.chunk.part}`;
    if (!sourcesMap.has(srcKey)) {
      sourcesMap.set(srcKey, {
        kind: 'doc',
        title: item.docName,
        page: item.chunk.page,
        snippet: item.chunk.text.slice(0, 160) + (item.chunk.text.length > 160 ? '...' : ''),
      });
    }
  }

  const largestDoc = [...docs].sort((a, b) => b.chars - a.chars)[0];

  return {
    formattedContext: `<documents>\n${parts.join('\n\n')}\n</documents>`,
    sources: Array.from(sourcesMap.values()),
    wasTruncated: true,
    truncatedDocName: largestDoc?.name || docs[0].name,
  };
}
