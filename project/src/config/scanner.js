// Everything that tunes the barcode scanner, in one place.

// Which barcode types the boxes may carry (zxing-wasm names). Every extra type is one more
// thing the decoder could mistake a pattern of stripes for, so list only what you really use.
// The PreBilt box labels (for example "TCT-abc-0001") are Code 128.
export const BARCODE_FORMATS = ['Code128', 'Code39', 'EAN13', 'EAN8', 'UPCA'];

// The camera is asked for a full-HD picture: a dense label (Code 128 with a dozen characters
// has about 170 bars) needs several pixels per bar. Devices give the closest they can.
export const CAMERA = { idealWidth: 1920, idealHeight: 1080 };

// What is handed to the decoder: the part of the picture the player can see, scaled down to
// at most this many pixels wide (keeps each frame quick), looked at about 16 times a second.
export const DECODE = { maxWidth: 1280, intervalMs: 60 };

// How a picture is turned into black and white before reading, tried in this order until one
// gives a barcode. The adaptive default copes with dim or uneven light; the fixed threshold
// reads blurred (out of focus, or moving) labels several times more often. Both are strict
// decoders, so trying two does not make a wrong read more likely (measured: none in 1,500
// frames of random stripes, none in 500 frames of a blurry label).
export const BINARIZERS = ['LocalAverage', 'FixedThreshold'];

// A box only counts once the SAME value has been read several times within a short time,
// and clearly more often than anything else seen at the same moment. A single noisy read
// (the kind that produced wrong numbers) never counts. See scanFilter.js.
export const CONFIRM = {
  minReads: 3,
  windowMs: 2000,
  dominance: 2,
  cooldownMs: 700,
  noticeMs: 2000
};
