// 共用範本：存在 Cloudflare D1（綁定名稱 DB）的 yc_presets 表。
// 底線開頭的檔案不會被當成 API 路由。

export function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

// 第一次使用時自動建表，部署後不用另外跑 SQL
export async function getDb(env) {
  if (!env || !env.DB) return null;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS yc_presets (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  return env.DB;
}

export function noDbResponse() {
  return jsonResponse({ error: "伺服器還沒有綁定 D1 資料庫（DB），範本暫時只能存在這台裝置。" }, 503);
}

export function cleanName(raw) {
  var name = typeof raw === "string" ? raw.trim() : "";
  return name && name.length <= 40 ? name : "";
}

// 只保留範本需要的欄位，避免存進任意資料
export function cleanPreset(body) {
  if (!body || !Array.isArray(body.fields)) return null;
  var fields = body.fields
    .filter(function (k) { return typeof k === "string" && /^[A-Za-z]{1,30}$/.test(k); })
    .slice(0, 100);
  return { fields: fields, showRatio: !!body.showRatio, compare: !!body.compare };
}

export function rowToPreset(row) {
  var data = {};
  try { data = JSON.parse(row.data); } catch (e) { /* 壞掉的資料當成空範本 */ }
  return {
    name: row.name,
    fields: Array.isArray(data.fields) ? data.fields : [],
    showRatio: !!data.showRatio,
    compare: !!data.compare,
    updatedAt: row.updated_at
  };
}
