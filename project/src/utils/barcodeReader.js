// The barcode decoder: ZXing compiled to WebAssembly (zxing-wasm).
//
// It is strict where the old decoder (Quagga) was lenient: a read needs a complete, valid
// symbol (quiet zones, checksum, agreeing scan lines). Quagga's EAN readers would "find"
// 8-digit numbers in plain stripes or in Code 128 bars, which is where the wrong numbers
// and the endless extra scans came from.
//
// The code and its .wasm file are fetched the first time a game starts (not on the
// leaderboard), and the offline worker keeps both, so scanning works without a network.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { BARCODE_FORMATS, BINARIZERS } from '../config/scanner.js';

let loading = null;

// Resolves with the decoder module. Safe to call many times; a failed load can be retried.
export function loadBarcodeReader() {
  if (!loading) {
    loading = import('zxing-wasm/reader')
      .then(async (zxing) => {
        await zxing.prepareZXingModule({
          overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
          fireImmediately: true
        });
        return zxing;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

// Looks for one barcode in a picture (ImageData). Returns { text, format } or null.
export async function readBarcode(zxing, imageData) {
  for (const binarizer of BINARIZERS) {
    const results = await zxing.readBarcodes(imageData, {
      formats: BARCODE_FORMATS,
      binarizer,
      tryHarder: true,
      tryRotate: true, // a box may be held at any angle
      tryInvert: false, // labels are dark bars on light paper
      maxNumberOfSymbols: 1
    });
    const hit = results.find((result) => result.isValid && result.text);
    if (hit) return { text: hit.text, format: hit.format };
  }
  return null;
}
