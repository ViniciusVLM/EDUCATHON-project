/** Ajudantes para enviar arquivos ao servidor (provas em branco ou respondidas). */
const RESIZABLE_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];

export function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Não foi possível abrir o arquivo.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fotos de celular costumam passar de 5 MB. Reduz para no máximo 2200 px no lado maior
 * (texto continua legível para a IA) e só usa a versão reduzida se ela ficar menor.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (!RESIZABLE_IMAGES.includes(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

