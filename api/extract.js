export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Gunakan metode POST."
    });
  }

  const input = req.body?.url;

  if (typeof input !== "string" || input.length > 4096) {
    return res.status(400).json({
      success: false,
      message: "URL tidak valid."
    });
  }

  function validUrl(value) {
    try {
      const u = new URL(value);
      return ["http:", "https:"].includes(u.protocol);
    } catch {
      return false;
    }
  }

  function decode(value) {
    let current = value;

    for (let i = 0; i < 5; i++) {
      let next = current;

      try {
        next = decodeURIComponent(next);
      } catch {}

      if (next === current) break;
      current = next;
    }

    return current;
  }

  function findMediaFire(text) {
    const decoded = decode(text);

    const pattern =
      /https?:\/\/(?:www\.)?mediafire\.com\/(?:file|folder|download)\/[A-Za-z0-9]+(?:\/[^\s"'<>]*)?/ig;

    for (const raw of decoded.match(pattern) || []) {
      try {
        const u = new URL(raw.replace(/[),.;]+$/, ""));

        if (
          u.protocol === "https:" &&
          ["mediafire.com", "www.mediafire.com"].includes(u.hostname)
        ) {
          return u.href;
        }
      } catch {}
    }

    return null;
  }

  const candidates = [input, decode(input)];

  try {
    const parsed = new URL(input);

    for (const [key, value] of parsed.searchParams.entries()) {
      if (/^(url|u|id|r|link|target|redirect|to)$/i.test(key)) {
        candidates.push(value, decode(value));
      }
    }
  } catch {}

  for (const candidate of candidates) {
    const result = findMediaFire(candidate);

    if (result) {
      return res.status(200).json({
        success: true,
        url: result,
        source: "url"
      });
    }
  }

  let source;

  try {
    source = new URL(input);

    if (
      source.protocol !== "https:" ||
      !["safelinku.com", "www.safelinku.com",
        "safelinku.net", "www.safelinku.net",
        "sfl.gl", "www.sfl.gl"].includes(source.hostname)
    ) {
      return res.status(400).json({
        success: false,
        message: "Domain belum didukung untuk pemeriksaan halaman."
      });
    }
  } catch {
    return res.status(400).json({
      success: false,
      message: "URL tidak valid."
    });
  }

  try {
    const response = await fetch(source.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "RANZXBYPASS/1.0"
      }
    });

    // Periksa redirect langsung, tanpa mengikuti rantai ke domain
    // yang tidak diketahui.
    const location = response.headers.get("location");

    if (location) {
      const target = new URL(location, source);

      if (
        target.protocol === "https:" &&
        ["mediafire.com", "www.mediafire.com"].includes(target.hostname)
      ) {
        const result = findMediaFire(target.href);

        if (result) {
          return res.status(200).json({
            success: true,
            url: result,
            source: "redirect"
          });
        }
      }
    }

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        message: "Halaman sumber tidak dapat dibaca."
      });
    }

    const html = await response.text();
    const result = findMediaFire(html);

    if (result) {
      return res.status(200).json({
        success: true,
        url: result,
        source: "html"
      });
    }

    return res.status(200).json({
      success: false,
      message: "Link MediaFire tidak ditemukan pada URL atau HTML yang tersedia."
    });
  } catch {
    return res.status(200).json({
      success: false,
      message: "Gagal mengakses halaman. Coba periksa URL kembali."
    });
  }
}
