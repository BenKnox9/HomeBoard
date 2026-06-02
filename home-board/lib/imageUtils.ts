import * as ImageManipulator from "expo-image-manipulator";

const MAX_DIMENSION = 1920;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export interface ImageAsset {
  uri: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
}

export class ImageValidationError extends Error {}

export async function prepareImage(asset: ImageAsset): Promise<{ uri: string; mimeType: string }> {
  if (asset.fileSize && asset.fileSize > MAX_BYTES) {
    throw new ImageValidationError(
      "Image is too large (max 15 MB). Please choose a smaller photo."
    );
  }

  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const needsResize = (w > MAX_DIMENSION || h > MAX_DIMENSION) && w > 0 && h > 0;

  if (!needsResize) {
    return { uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" };
  }

  const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: Math.round(w * ratio), height: Math.round(h * ratio) } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );

  return { uri: result.uri, mimeType: "image/jpeg" };
}
