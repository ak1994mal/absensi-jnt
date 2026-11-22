export function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str || 'user');
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function getWebAuthnRpId(): string {
  if (typeof window === 'undefined') return 'absen-jnt.vercel.app';
  return (window.location.hostname || 'absen-jnt.vercel.app').toLowerCase();
}

export function detectFriendlyDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Perangkat Browser';
  const ua = navigator.userAgent || '';
  let os = 'Perangkat';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return `${os} · ${browser}`;
}

export function parseSignCountFromAuthDataB64Url(authDataB64u: string): number {
  try {
    let b64 = String(authDataB64u || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bin = atob(b64);
    if (bin.length < 37) return 0;
    return (
      ((bin.charCodeAt(33) << 24) >>> 0) +
      (bin.charCodeAt(34) << 16) +
      (bin.charCodeAt(35) << 8) +
      bin.charCodeAt(36)
    );
  } catch (e) {
    return 0;
  }
}

export async function detectCameraAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return false;
  }
  try {
    if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      if (devices.length > 0 && videoInputs.length === 0) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return true;
  }
}

type FaceApiModule = typeof import('@vladmandic/face-api');
let faceApiLoadPromise: Promise<FaceApiModule> | null = null;

export async function loadFaceModelsLazy(): Promise<FaceApiModule> {
  if (!faceApiLoadPromise) {
    faceApiLoadPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const modelPath = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
      ]);
      return faceapi;
    })().catch((err) => {
      faceApiLoadPromise = null;
      throw err;
    });
  }
  return faceApiLoadPromise;
}

function ptDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function extractLivenessMetrics(landmarks: any, box: { width: number; height: number }) {
  const pts: Array<{ x: number; y: number }> = landmarks?.positions || [];
  if (pts.length < 48) {
    return { ear: 0.3, noseNormX: 0.5, noseNormY: 0.5 };
  }
  // Left eye 36..41, Right eye 42..47, Nose tip 30
  const leftEar =
    (ptDist(pts[37], pts[41]) + ptDist(pts[38], pts[40])) /
    Math.max(1e-4, 2 * ptDist(pts[36], pts[39]));
  const rightEar =
    (ptDist(pts[43], pts[47]) + ptDist(pts[44], pts[46])) /
    Math.max(1e-4, 2 * ptDist(pts[42], pts[45]));
  const nose = pts[30];
  const w = Math.max(1, box?.width || 1);
  const h = Math.max(1, box?.height || 1);
  return {
    ear: (leftEar + rightEar) / 2,
    noseNormX: nose.x / w,
    noseNormY: nose.y / h
  };
}

export function averageAndNormalizeDescriptors(descriptors: number[][]): number[] {
  if (!descriptors.length) return [];
  const len = descriptors[0].length;
  const avg = new Array<number>(len).fill(0);
  for (let i = 0; i < descriptors.length; i++) {
    for (let j = 0; j < len; j++) {
      avg[j] += descriptors[i][j] / descriptors.length;
    }
  }
  return avg.map((n) => Number(n.toFixed(6)));
}
