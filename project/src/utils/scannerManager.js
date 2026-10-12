import { CAMERA, CONFIRM, DECODE } from '../config/scanner.js';
import { loadBarcodeReader, readBarcode } from './barcodeReader.js';
import { ScanFilter } from './scanFilter.js';
import { visibleArea } from './visibleArea.js';

function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: CAMERA.idealWidth },
      height: { ideal: CAMERA.idealHeight }
    }
  });
}

// Starts the rear camera inside a container, reads barcodes from it and reports each box
// that counts through `onDetected(code)`. One game at a time: initialize() always starts from
// a clean slate and cleanup() stops everything, so nothing carries over to the next game.
class ScannerManager {
  constructor() {
    this.run = 0; // bumped by every initialize/cleanup so a stale loop or load stops itself
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.context = null;
    this.timer = null;
    this.filter = null;
    this.feedbackTimer = null;
  }

  async initialize(containerId, onDetected) {
    await this.cleanup();
    const run = this.run;
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Scanner container #${containerId} was not found`);

    // The decoder downloads while the browser asks for the camera, so neither waits for the other.
    const [decoder, camera] = await Promise.allSettled([loadBarcodeReader(), openCamera()]);
    const stopCamera = () => {
      if (camera.status === 'fulfilled') camera.value.getTracks().forEach((track) => track.stop());
    };
    if (run !== this.run) {
      stopCamera(); // the game was left while this was still loading
      return;
    }
    if (decoder.status === 'rejected' || camera.status === 'rejected') {
      stopCamera();
      this.showFeedback(false, camera.status === 'rejected' ? 'Failed to access camera' : 'Scanner failed to load');
      throw (camera.status === 'rejected' ? camera.reason : decoder.reason);
    }

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.srcObject = camera.value;
    container.appendChild(video);
    this.stream = camera.value;
    this.video = video;
    try {
      await video.play();
    } catch (error) {
      if (run !== this.run) return; // the game was left meanwhile; not a camera problem
      await this.cleanup();
      this.showFeedback(false, 'Failed to access camera');
      throw error;
    }
    if (run !== this.run) return;

    this.filter = new ScanFilter(CONFIRM);
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.scanLoop(run, decoder.value, container, onDetected);
  }

  // About 16 looks per second, never overlapping: the next one is scheduled after the last finished.
  scanLoop(run, zxing, container, onDetected) {
    const tick = async () => {
      if (run !== this.run) return;
      const started = performance.now();
      try {
        await this.scanFrame(zxing, container, onDetected);
      } catch (error) {
        console.error('Scanning a frame failed:', error);
      }
      if (run !== this.run) return;
      this.timer = setTimeout(tick, Math.max(0, DECODE.intervalMs - (performance.now() - started)));
    };
    tick();
  }

  async scanFrame(zxing, container, onDetected) {
    const { video, canvas, context } = this;
    if (!video || document.hidden || video.readyState < 2 || !video.videoWidth) return;

    const area = visibleArea(
      video.videoWidth,
      video.videoHeight,
      container.clientWidth || video.videoWidth,
      container.clientHeight || video.videoHeight
    );
    const width = Math.min(DECODE.maxWidth, Math.round(area.width));
    const height = Math.round(area.height * (width / area.width));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.drawImage(video, area.x, area.y, area.width, area.height, 0, 0, width, height);

    const hit = await readBarcode(zxing, context.getImageData(0, 0, width, height));
    if (!hit || !this.filter) return;

    const outcome = this.filter.read(hit.text, performance.now());
    if (outcome.type === 'accepted') {
      this.showFeedback(true, 'New barcode scanned!');
      onDetected(outcome.code);
    } else if (outcome.type === 'duplicate') {
      this.showFeedback(false, 'Already scanned. Try another box.');
    }
  }

  async cleanup() {
    this.run += 1;
    clearTimeout(this.timer);
    this.timer = null;
    this.filter = null;
    this.canvas = null;
    this.context = null;
    const hadCamera = Boolean(this.stream);
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    // Some handhelds need a moment before the camera can be opened again.
    if (hadCamera) await new Promise((resolve) => setTimeout(resolve, 150));
  }

  showFeedback(success, message) {
    const feedback = document.getElementById('scanFeedback');
    if (!feedback) return;

    feedback.className = `scan-feedback ${success ? 'success' : 'error'}`;
    feedback.textContent = message || (success ? 'Scan Successful!' : 'Scan Failed');

    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      feedback.className = 'scan-feedback';
      feedback.textContent = '';
    }, 1500);
  }
}

export const scannerManager = new ScannerManager();

// Start fetching the decoder while the player is still typing their details, so the
// camera screen does not wait for it. Failures are ignored here; starting a game retries.
export function preloadScanner() {
  setTimeout(() => loadBarcodeReader().catch(() => {}), 300);
}
