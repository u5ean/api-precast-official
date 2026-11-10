// Shrinks a phone photo before upload. The multipart field is still named "image".
// Falls back to the original file if anything fails.

export async function prepareImage(file, { maxEdge = 1800, quality = 0.85 } = {}) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxEdge / longest);
    if (scale === 1 && file.size < 900 * 1024 && file.type === "image/jpeg") return file;
    const w = Math.round(bitmap.width * scale);
    const hgt = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = hgt;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, hgt);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "delivery-order.jpg", { type: "image/jpeg" });
  } catch (_) {
    return file;
  }
}
