import { PHOTO_MAX_BYTES, PHOTO_MAX_PX } from "@/lib/lanterns/media";
import { scaledSize } from "@/lib/lanterns/photo-size";

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Esportazione della foto non riuscita"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Ridisegnare la foto su un canvas la ridimensiona e ne toglie i metadati,
 * compresa la posizione GPS: dal telefono esce solo l'immagine.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  const size = scaledSize(bitmap.width, bitmap.height, PHOTO_MAX_PX);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Canvas non disponibile");
  }
  // Il JPEG non ha trasparenza: senza fondo, le parti trasparenti diventerebbero nere.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const blob = await toJpeg(canvas, 0.85);
  if (blob.size <= PHOTO_MAX_BYTES) return blob;
  const smaller = await toJpeg(canvas, 0.7);
  if (smaller.size <= PHOTO_MAX_BYTES) return smaller;
  throw new Error("Foto troppo pesante");
}
