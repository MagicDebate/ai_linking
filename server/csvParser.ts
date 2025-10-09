import iconv from 'iconv-lite';

export interface CSVParseOptions {
  delimiter?: string;
  encoding?: string;
}

export function detectDelimiter(csvText: string): string {
  const firstLine = csvText.split('\n')[0];
  
  const delimiters = [',', ';', '\t', '|'];
  const counts = delimiters.map(d => ({
    delimiter: d,
    count: (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length
  }));
  
  const detected = counts.reduce((max, curr) => 
    curr.count > max.count ? curr : max
  );
  
  return detected.count > 0 ? detected.delimiter : ',';
}

export function detectEncoding(buffer: Buffer): string {
  const bytes = buffer.slice(0, 1000);
  
  // Check for UTF-8 BOM
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'utf-8';
  }
  
  // Try to decode as UTF-8 and check if it's valid
  try {
    const utf8Text = buffer.toString('utf-8');
    // Check if decoded text contains replacement characters (�)
    // which indicates invalid UTF-8
    if (!utf8Text.includes('\uFFFD')) {
      // Additional check: validate UTF-8 sequences
      let isValidUtf8 = true;
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte > 127) {
          // Multi-byte UTF-8 sequence check
          if ((byte & 0xE0) === 0xC0) {
            // 2-byte sequence
            if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) {
              isValidUtf8 = false;
              break;
            }
            i += 1;
          } else if ((byte & 0xF0) === 0xE0) {
            // 3-byte sequence (Cyrillic is here)
            if (i + 2 >= bytes.length || 
                (bytes[i + 1] & 0xC0) !== 0x80 || 
                (bytes[i + 2] & 0xC0) !== 0x80) {
              isValidUtf8 = false;
              break;
            }
            i += 2;
          } else if ((byte & 0xF8) === 0xF0) {
            // 4-byte sequence
            if (i + 3 >= bytes.length || 
                (bytes[i + 1] & 0xC0) !== 0x80 || 
                (bytes[i + 2] & 0xC0) !== 0x80 || 
                (bytes[i + 3] & 0xC0) !== 0x80) {
              isValidUtf8 = false;
              break;
            }
            i += 3;
          } else {
            // Invalid UTF-8 start byte
            isValidUtf8 = false;
            break;
          }
        }
      }
      
      if (isValidUtf8) {
        return 'utf-8';
      }
    }
  } catch (error) {
    // UTF-8 decoding failed
  }
  
  // Check for Windows-1251 specific patterns
  let hasWindows1251Pattern = false;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    // Windows-1251 Cyrillic range
    if ((byte >= 0xC0 && byte <= 0xFF) || (byte >= 0xA8 && byte <= 0xB8)) {
      hasWindows1251Pattern = true;
      break;
    }
  }
  
  if (hasWindows1251Pattern) {
    return 'windows-1251';
  }
  
  // Default to UTF-8
  return 'utf-8';
}

export function parseCSV(input: string | Buffer, options: CSVParseOptions = {}): string[][] {
  let csvText: string;
  
  if (Buffer.isBuffer(input)) {
    const encoding = options.encoding || detectEncoding(input);
    console.log(`📝 Detected encoding: ${encoding}`);
    
    try {
      csvText = iconv.decode(input, encoding);
    } catch (error) {
      console.warn(`⚠️ Failed to decode with ${encoding}, falling back to utf-8`);
      csvText = input.toString('utf-8');
    }
  } else {
    csvText = input;
  }
  
  const delimiter = options.delimiter || detectDelimiter(csvText);
  console.log(`📝 Using delimiter: ${delimiter === '\t' ? '\\t (tab)' : delimiter}`);
  
  const results: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < csvText.length) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      currentRow.push(currentField.trim());
      if (currentRow.length > 0 && currentRow.some(field => field.length > 0)) {
        results.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      if (char === '\r' && nextChar === '\n') i++;
    } else {
      currentField += char;
    }
    i++;
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 0 && currentRow.some(field => field.length > 0)) {
      results.push(currentRow);
    }
  }
  
  console.log(`🎯 CSV parsed: ${results.length} rows`);
  return results;
}
