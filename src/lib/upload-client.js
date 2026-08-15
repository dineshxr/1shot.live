// Browser-side image compression + upload to /api/upload (Cloudflare R2).
// Replaces direct-from-browser Supabase Storage uploads. Images are downscaled
// and re-encoded before leaving the browser so multi-MB screenshots never hit
// storage or visitors again.

const MAX_WIDTH = { logo: 512, cover: 1600, screenshot: 1600 };
const SKIP_COMPRESSION_TYPES = new Set(['image/gif', 'image/svg+xml']);
const SMALL_ENOUGH = 150 * 1024;

const blobFromCanvas = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Downscale + re-encode. Returns { blob, contentType }; falls back to the
// original file when compression isn't possible or doesn't help.
export const compressImage = async (file, kind = 'screenshot') => {
  const original = { blob: file, contentType: file.type || 'image/png' };
  if (SKIP_COMPRESSION_TYPES.has(file.type)) return original;
  try {
    const bitmap = await createImageBitmap(file);
    const maxWidth = MAX_WIDTH[kind] || 1600;
    const scale = Math.min(1, maxWidth / bitmap.width);
    if (scale === 1 && file.size <= SMALL_ENOUGH) return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let blob = await blobFromCanvas(canvas, 'image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await blobFromCanvas(canvas, 'image/jpeg', 0.85);
    if (!blob) return original;
    if (blob.size >= file.size) return original;
    return { blob, contentType: blob.type };
  } catch (e) {
    console.warn('compressImage failed, uploading original:', e);
    return original;
  }
};

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });

// Compress + upload. kind is 'logo' | 'cover' | 'screenshot'.
// Returns { url } on success or { error } on failure.
export const uploadImage = async (file, kind) => {
  try {
    const { blob, contentType } = await compressImage(file, kind);
    const dataBase64 = await toBase64(blob);
    const res = await fetch('/api/upload.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, contentType, dataBase64 }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) return { error: json.error || `Upload failed (${res.status})` };
    return { url: json.url };
  } catch (e) {
    console.error('uploadImage error:', e);
    return { error: 'Upload failed. Please try a different image.' };
  }
};
