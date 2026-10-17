/**
 * Leitura de arquivos de prova enviados pelo professor (PDF, Word, foto ou texto).
 *
 * - O tipo do arquivo é detectado pelos primeiros bytes (assinatura), nunca pela extensão
 *   ou pelo tipo informado pelo navegador, que podem ser falsificados.
 * - Arquivos .docx são abertos aqui mesmo (um .docx é um ZIP com o texto em word/document.xml),
 *   sem dependências externas e com limite de tamanho descompactado (proteção contra "zip bomb").
 * - PDF e imagens seguem em binário para o Gemini, que lê esses formatos diretamente.
 * - Nada é gravado em disco: o arquivo só existe em memória durante a requisição.
 */
import { inflateRawSync } from 'node:zlib';

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_EXTRACTED_TEXT_CHARS = 60000;
const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024; // 20 MB descompactado

export class DocumentError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'DocumentError';
    this.status = status;
  }
}

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return false;
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    // Caracteres de controle fora de tab, quebra de linha e retorno de carro
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return control / sample.length < 0.02;
}

/**
 * Detecta o tipo real do arquivo a partir dos bytes.
 * @returns {{kind: 'pdf'|'docx'|'image'|'text', mimeType: string}}
 */
export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new DocumentError('O arquivo está vazio.', 400);
  }

  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return {
      kind: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { kind: 'image', mimeType: 'image/jpeg' };
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  // Fotos de iPhone (HEIC/HEIF): "ftyp" no byte 4 seguido da marca
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'heim', 'heis'].includes(brand)) {
      return { kind: 'image', mimeType: 'image/heic' };
    }
    if (['mif1', 'msf1'].includes(brand)) {
      return { kind: 'image', mimeType: 'image/heif' };
    }
  }
  if (looksLikeText(buffer)) {
    return { kind: 'text', mimeType: 'text/plain' };
  }

  throw new DocumentError(
    'Formato não suportado. Envie a prova em PDF, Word (.docx), foto (JPG, PNG, WEBP ou HEIC) ou texto (.txt).',
    415
  );
}

/**
 * Converte bytes de texto em string, tolerando arquivos salvos em UTF-8 (com ou sem BOM)
 * ou no padrão antigo do Windows (Latin-1 / Windows-1252).
 */
export function decodeText(buffer) {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('�')) {
    text = buffer.toString('latin1');
  }
  return text.replace(/\r\n?/g, '\n');
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Lê uma entrada específica de um arquivo ZIP usando o diretório central
 * (que sempre traz tamanhos e posições, ao contrário dos cabeçalhos locais).
 */
function readZipEntry(buffer, entryName) {
  const EOCD_SIG = 0x06054b50;
  const CEN_SIG = 0x02014b50;
  const LOC_SIG = 0x04034b50;

  let eocd = -1;
  const minPos = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= minPos; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new DocumentError('O arquivo Word está corrompido ou incompleto.');

  const entries = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);

  for (let n = 0; n < entries; n++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CEN_SIG) break;
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    if (name === entryName) {
      if (uncompressedSize > MAX_DOCX_XML_BYTES) {
        throw new DocumentError('O arquivo Word é grande demais para ser lido.', 413);
      }
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOC_SIG) {
        throw new DocumentError('O arquivo Word está corrompido ou incompleto.');
      }
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return data;
      if (method === 8) {
        try {
          return inflateRawSync(data, { maxOutputLength: MAX_DOCX_XML_BYTES });
        } catch {
          throw new DocumentError('Não foi possível abrir o arquivo Word.');
        }
      }
      throw new DocumentError('O arquivo Word usa uma compressão não suportada.');
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return null;
}

/**
 * Extrai o texto corrido de um .docx, preservando quebras de parágrafo e tabulações.
 */
export function extractDocxText(buffer) {
  const xmlBuffer = readZipEntry(buffer, 'word/document.xml');
  if (!xmlBuffer) {
    throw new DocumentError(
      'Este arquivo não parece ser um documento Word (.docx). Arquivos .doc antigos devem ser salvos como .docx ou PDF.',
      415
    );
  }

  const xml = xmlBuffer.toString('utf8');
  const text = xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '');

  return decodeXmlEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Prepara o arquivo para a IA: texto (txt/docx) ou binário (pdf/imagem).
 * @returns {{kind: string, mimeType: string, text?: string, buffer?: Buffer, truncated?: boolean}}
 */
export function readExamDocument(buffer) {
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new DocumentError('O arquivo é maior que o limite de 8 MB.', 413);
  }

  const { kind, mimeType } = detectFileType(buffer);

  if (kind === 'text' || kind === 'docx') {
    let text = kind === 'text' ? decodeText(buffer).trim() : extractDocxText(buffer);
    if (!text) {
      throw new DocumentError('Não encontramos texto neste arquivo.');
    }
    let truncated = false;
    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
      text = text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
      truncated = true;
    }
    return { kind, mimeType, text, truncated };
  }

  return { kind, mimeType, buffer };
}
