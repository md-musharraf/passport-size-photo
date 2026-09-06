// Shared face-api model loader used by the single-photo editor and the batch
// pipeline, so both use the same detector strategy.
//
// Always loads the tiny detector + 68-point landmarks (bundled offline). It
// additionally loads the more accurate SSD MobileNet detector, but ONLY when its
// second weight shard is actually present — the app historically shipped just
// shard1, so blindly calling loadFromUri() threw a noisy tensor-shape error on
// every startup. A cheap availability probe avoids that and keeps SSD a clean
// progressive enhancement (a full `npm run download-face-models` fetches shard2).

type FaceApi = typeof import('face-api.js');

let ssdChecked = false;
let ssdAvailable = false;

export function getModelsPath(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/models` : '/models';
}

async function isSsdComplete(modelsPath: string): Promise<boolean> {
  if (ssdChecked) return ssdAvailable;
  ssdChecked = true;
  try {
    const res = await fetch(`${modelsPath}/ssd_mobilenetv1_model-shard2`, { method: 'HEAD' });
    ssdAvailable = res.ok;
  } catch {
    ssdAvailable = false;
  }
  return ssdAvailable;
}

/** Ensure detectors + landmarks are loaded. Returns whether SSD is usable. */
export async function ensureFaceModels(faceapi: FaceApi): Promise<{ ssd: boolean }> {
  const modelsPath = getModelsPath();

  if (!faceapi.nets.tinyFaceDetector.params || !faceapi.nets.faceLandmark68Net.params) {
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath);
  }

  if (!faceapi.nets.ssdMobilenetv1.params && (await isSsdComplete(modelsPath))) {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(modelsPath);
    } catch {
      ssdAvailable = false;
    }
  }

  return { ssd: !!faceapi.nets.ssdMobilenetv1.params };
}

/** Detector options: prefer the sharper SSD box, else a high-res tiny detector. */
export function makeDetectorOptions(faceapi: FaceApi) {
  if (faceapi.nets.ssdMobilenetv1.params) {
    return new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
  }
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 });
}
