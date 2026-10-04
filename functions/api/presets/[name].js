import { jsonResponse, getDb, noDbResponse, cleanName, cleanPreset, rowToPreset } from "../_presets.js";

// 路由參數保留 URL 編碼（中文名稱會是 %E5…），要先解碼
function paramName(context) {
  var raw = String(context.params.name || "");
  try { return cleanName(decodeURIComponent(raw)); } catch (e) { return cleanName(raw); }
}

async function readBody(request) {
  try { return await request.json(); } catch (e) { return null; }
}

// PUT /api/presets/:name：新增或覆蓋範本
export async function onRequestPut(context) {
  var db = await getDb(context.env);
  if (!db) return noDbResponse();
  var name = paramName(context);
  if (!name) return jsonResponse({ error: "範本名稱要 1～40 個字" }, 400);
  var preset = cleanPreset(await readBody(context.request));
  if (!preset) return jsonResponse({ error: "範本內容格式錯誤" }, 400);
  var now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO yc_presets (name, data, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(name, JSON.stringify(preset), now).run();
  return jsonResponse({ preset: rowToPreset({ name: name, data: JSON.stringify(preset), updated_at: now }) });
}

// PATCH /api/presets/:name  body {newName}：改名
export async function onRequestPatch(context) {
  var db = await getDb(context.env);
  if (!db) return noDbResponse();
  var name = paramName(context);
  var body = await readBody(context.request);
  var newName = cleanName(body && body.newName);
  if (!name || !newName) return jsonResponse({ error: "範本名稱要 1～40 個字" }, 400);
  var taken = await db.prepare("SELECT name FROM yc_presets WHERE name = ?").bind(newName).first();
  if (taken) return jsonResponse({ error: "已有同名範本「" + newName + "」" }, 409);
  var res = await db.prepare("UPDATE yc_presets SET name = ?, updated_at = ? WHERE name = ?")
    .bind(newName, new Date().toISOString(), name).run();
  if (!res.meta || !res.meta.changes) return jsonResponse({ error: "找不到範本「" + name + "」" }, 404);
  return jsonResponse({ ok: true });
}

// DELETE /api/presets/:name
export async function onRequestDelete(context) {
  var db = await getDb(context.env);
  if (!db) return noDbResponse();
  var name = paramName(context);
  if (!name) return jsonResponse({ error: "範本名稱錯誤" }, 400);
  await db.prepare("DELETE FROM yc_presets WHERE name = ?").bind(name).run();
  return jsonResponse({ ok: true });
}
