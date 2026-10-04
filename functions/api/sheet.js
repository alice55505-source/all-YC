// GET /api/sheet：伺服器端抓固定的 Google 試算表（匯出成 .xlsx）轉給前端解析。
// 瀏覽器不能直接跨網域抓 Google 試算表，所以由 Pages Function 代抓。
// 試算表必須設為「知道連結的任何人都能檢視」。
// 預設快取 5 分鐘；加 ?refresh=1 會略過快取重新抓。

const DEFAULT_SHEET_ID = "1Wk-SpOaySFl6ZEbbIqV45CN3LY3R82vFgD5ggu0988I";
const CACHE_SECONDS = 300;

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

// Content-Disposition 裡帶有試算表檔名（filename*=UTF-8''...）
function titleFromDisposition(header) {
  if (!header) return "";
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1]).replace(/\.xlsx$/i, ""); } catch (e) { /* fall through */ }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].replace(/\.xlsx$/i, "") : "";
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const sheetId = (env && env.SHEET_ID) || DEFAULT_SHEET_ID;
  const refresh = new URL(request.url).searchParams.has("refresh");
  const cache = caches.default;
  const cacheKey = new Request("https://sheet-cache.internal/" + sheetId + ".xlsx");

  if (!refresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let upstream;
  try {
    upstream = await fetch(
      "https://docs.google.com/spreadsheets/d/" + sheetId + "/export?format=xlsx",
      { redirect: "follow" }
    );
  } catch (e) {
    return errorResponse("連不上 Google 試算表：" + e.message, 502);
  }

  const type = upstream.headers.get("content-type") || "";
  if (!upstream.ok || type.indexOf("text/html") >= 0) {
    return errorResponse(
      "抓不到試算表（HTTP " + upstream.status + "）。請確認試算表的共用設定是「知道連結的任何人」都能檢視。",
      502
    );
  }

  const body = await upstream.arrayBuffer();
  const title = titleFromDisposition(upstream.headers.get("content-disposition"));
  const response = new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "public, max-age=" + CACHE_SECONDS,
      "X-Fetched-At": new Date().toISOString(),
      "X-Sheet-Id": sheetId,
      "X-Sheet-Title": encodeURIComponent(title),
      "Access-Control-Expose-Headers": "X-Fetched-At, X-Sheet-Id, X-Sheet-Title"
    }
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
