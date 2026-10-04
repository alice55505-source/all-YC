import { jsonResponse, getDb, noDbResponse, rowToPreset } from "../_presets.js";

// GET /api/presets：列出所有共用範本
export async function onRequestGet(context) {
  var db = await getDb(context.env);
  if (!db) return noDbResponse();
  var result = await db.prepare("SELECT name, data, updated_at FROM yc_presets ORDER BY name").all();
  return jsonResponse({ presets: (result.results || []).map(rowToPreset) });
}
