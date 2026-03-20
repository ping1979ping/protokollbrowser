/**
 * Extract GPS coordinates from JPEG EXIF data.
 * No external library — parses EXIF APP1 segment directly.
 */
export async function extractGpsFromImage(file: File): Promise<{ lat: number; lon: number } | null> {
  try {
    // Read first 128KB — EXIF is always near the start
    const slice = file.slice(0, 131072);
    const buf = await slice.arrayBuffer();
    const view = new DataView(buf);

    // Check JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        // APP1 — EXIF
        const length = view.getUint16(offset + 2);
        return parseExifGps(view, offset + 4, length - 2);
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      const segLen = view.getUint16(offset + 2);
      offset += 2 + segLen;
    }
    return null;
  } catch {
    return null;
  }
}

function parseExifGps(view: DataView, start: number, length: number): { lat: number; lon: number } | null {
  const end = start + length;
  // Check "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0x0000) return null;

  const tiffStart = start + 6;
  const byteOrder = view.getUint16(tiffStart);
  const le = byteOrder === 0x4949; // Little-endian

  function getU16(o: number) { return view.getUint16(o, le); }
  function getU32(o: number) { return view.getUint32(o, le); }

  // Verify TIFF magic
  if (getU16(tiffStart + 2) !== 0x002A) return null;

  const ifd0Offset = tiffStart + getU32(tiffStart + 4);

  // Find GPS IFD pointer in IFD0
  let gpsIfdOffset = 0;
  const ifd0Count = getU16(ifd0Offset);
  for (let i = 0; i < ifd0Count; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > end) break;
    const tag = getU16(entryOffset);
    if (tag === 0x8825) { // GPSInfoIFDPointer
      gpsIfdOffset = tiffStart + getU32(entryOffset + 8);
      break;
    }
  }
  if (!gpsIfdOffset) return null;

  // Parse GPS IFD
  const gpsCount = getU16(gpsIfdOffset);
  let latRef = '', lonRef = '';
  let latRationals: number[] | null = null;
  let lonRationals: number[] | null = null;

  for (let i = 0; i < gpsCount; i++) {
    const entryOffset = gpsIfdOffset + 2 + i * 12;
    if (entryOffset + 12 > end) break;
    const tag = getU16(entryOffset);
    const count = getU32(entryOffset + 4);

    switch (tag) {
      case 1: // GPSLatitudeRef
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 2: // GPSLatitude (3 rationals)
        if (count === 3) latRationals = readRationals(view, tiffStart + getU32(entryOffset + 8), 3, le, end);
        break;
      case 3: // GPSLongitudeRef
        lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 4: // GPSLongitude (3 rationals)
        if (count === 3) lonRationals = readRationals(view, tiffStart + getU32(entryOffset + 8), 3, le, end);
        break;
    }
  }

  if (!latRationals || !lonRationals) return null;

  let lat = latRationals[0] + latRationals[1] / 60 + latRationals[2] / 3600;
  let lon = lonRationals[0] + lonRationals[1] / 60 + lonRationals[2] / 3600;

  if (latRef === 'S') lat = -lat;
  if (lonRef === 'W') lon = -lon;

  // Sanity check
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;

  return { lat, lon };
}

function readRationals(view: DataView, offset: number, count: number, le: boolean, end: number): number[] | null {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = offset + i * 8;
    if (o + 8 > end) return null;
    const num = view.getUint32(o, le);
    const den = view.getUint32(o + 4, le);
    values.push(den === 0 ? 0 : num / den);
  }
  return values;
}
