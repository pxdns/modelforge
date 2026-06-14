const fs = require("fs/promises");
const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

async function readZipEntryText(zipPath, entryNames) {
  const buffer = await fs.readFile(zipPath);
  const entries = parseEntries(buffer);
  for (const entryName of entryNames) {
    const entry = entries.get(entryName);
    if (!entry) continue;
    const data = readEntryData(buffer, entry);
    return data.toString("utf8");
  }
  return null;
}

function parseEntries(buffer) {
  const eocdOffset = findSignature(buffer, EOCD_SIGNATURE, Math.max(0, buffer.length - 65557));
  if (eocdOffset === -1) return new Map();

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries && offset < buffer.length; i++) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== CENTRAL_DIRECTORY_SIGNATURE) break;

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    entries.set(fileName, {
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntryData(buffer, entry) {
  const localHeaderOffset = entry.localHeaderOffset;
  const signature = buffer.readUInt32LE(localHeaderOffset);
  if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Invalid zip local header");
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedData = buffer.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressedData);
  throw new Error(`Unsupported zip compression method: ${entry.compressionMethod}`);
}

function findSignature(buffer, signature, fromIndex = 0) {
  for (let i = Math.max(0, fromIndex); i <= buffer.length - 4; i++) {
    if (buffer.readUInt32LE(i) === signature) return i;
  }
  return -1;
}

module.exports = {
  readZipEntryText
};
