// DavAI — Cloudinary upload helper.
// Uses unsigned upload preset (no API secret in frontend).

const CLOUD_NAME = "nhxuht4e";
const UPLOAD_PRESET = "davai_user_dp";
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Upload an image file to Cloudinary.
 * @param {File} file
 * @returns {Promise<{url: string, publicId: string, width: number, height: number}>}
 */
export async function uploadImage(file) {
  if (!file) throw new Error("no_file");
  if (!file.type.startsWith("image/")) throw new Error("not_an_image");
  if (file.size > MAX_BYTES) throw new Error("file_too_large");

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "davai/dp");

  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    throw new Error("cloudinary_http_" + res.status + (detail ? ": " + detail.slice(0, 200) : ""));
  }

  const data = await res.json();
  return {
    url: data.secure_url || data.url,
    publicId: data.public_id,
    width: data.width,
    height: data.height
  };
}

/**
 * Build initials-based fallback avatar.
 * Ravi Singh → "RS", single word "Ravi" → "R", empty → "?"
 */
export function initialsFrom(nameOrEmail) {
  const s = String(nameOrEmail || "").trim();
  if (!s) return "?";
  if (s.includes("@")) {
    return s[0].toUpperCase();
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
