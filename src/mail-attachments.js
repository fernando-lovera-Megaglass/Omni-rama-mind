// Direct MIME delivery only. Reject oversized selections instead of silently dropping
// files or creating Storage links with an unrelated retention/access lifecycle.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const attachmentMetadata = (file) => ({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
export const formatAttachmentSize = (size) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
export function validateAttachmentSize(files) {
  if (files.reduce((sum, f) => sum + f.size, 0) >= MAX_ATTACHMENT_BYTES) throw new Error('Los adjuntos deben sumar menos de 20 MB. Quita archivos o selecciona archivos más pequeños.');
}
export async function encodeAttachments(files) {
  validateAttachmentSize(files);
  return Promise.all(files.map(async (file) => {
    const content = await new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return { ...attachmentMetadata(file), content };
  }));
}
