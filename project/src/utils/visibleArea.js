// The part of the camera picture the player can actually see. The video fills its frame like
// `object-fit: cover`, so whatever does not fit is cropped away. The scanner looks at exactly
// the visible part, so a barcode the player cannot see is never counted.
//
// Returns the region of the video (in video pixels) that is on screen.
export function visibleArea(videoWidth, videoHeight, boxWidth, boxHeight) {
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = boxWidth / scale;
  const height = boxHeight / scale;
  return { x: (videoWidth - width) / 2, y: (videoHeight - height) / 2, width, height };
}
