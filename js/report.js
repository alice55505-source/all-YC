/* 月報表計算邏輯：解析週報試算表、依主日日期歸月、計算月平均。
 * 純函式，不碰 DOM；瀏覽器掛在 window.YCReport，Node 測試用 module.exports。 */
(function (root) {
  "use strict";

  // 週報分頁「顯示區」的欄位（第 5 列起每列一個小區）。
  // agg: avg = 當月各週平均（或合計）；last = 取當月最後一週（基數、名冊、累計類）
  // cat / short: 報表表頭的大分類與分類底下的短名稱
  // baseLabel: 各種基數在報表表頭統一歸在「基數」底下時的名稱
  // fixed: 固定值（基數、目標、兒童排數、得少人數），只放一欄、不分月份、不顯示較上月增減
  // ratio: 佔比的分母欄位
  var FIELDS = [
    { key: "base", label: "二六基數", col: "C", group: "召會生活", agg: "last", fixed: true, baseLabel: "全召會" },
    { key: "sunday", label: "主日", col: "D", group: "召會生活", ratio: "base" },
    { key: "sundayYP", label: "主日青職", col: "F", group: "召會生活", ratio: "base" },
    { key: "prayer", label: "禱告", col: "H", group: "召會生活", ratio: "base" },
    { key: "groupCount", label: "排數", col: "J", group: "召會生活" },
    { key: "smallGroup", label: "小排", col: "K", group: "召會生活", ratio: "base" },
    { key: "gospel", label: "福音出訪", col: "M", group: "召會生活", ratio: "base" },
    { key: "homeOut", label: "家聚出訪", col: "O", group: "召會生活" },
    { key: "homeIn", label: "家聚受訪", col: "P", group: "召會生活" },
    { key: "home", label: "家聚會", group: "召會生活", sumOf: ["homeOut", "homeIn"], ratio: "base", note: "出訪＋受訪" },
    { key: "lifeStudy", label: "生命讀經", col: "R", group: "召會生活", ratio: "base" },
    { key: "morning", label: "晨興", col: "T", group: "召會生活", ratio: "base" },
    { key: "baptGoal", label: "受浸目標", col: "V", group: "受浸", agg: "last", fixed: true },
    { key: "baptTotal", label: "受浸累計", col: "W", group: "受浸", agg: "last", ratio: "baptGoal" },
    { key: "baptMonth", label: "本月受浸", group: "受浸", monthDiffOf: "baptTotal", note: "本月底累計 − 上月底累計" },

    { key: "ypBase", label: "青職基數", cat: "青職", short: "基數", col: "AA", group: "青職", agg: "last", fixed: true, baseLabel: "青職" },
    { key: "ypSunday", label: "青職主日", cat: "青職", short: "主日", col: "AB", group: "青職", ratio: "ypBase" },
    { key: "ypHome", label: "青職家聚", cat: "青職", short: "家聚", col: "AC", group: "青職", ratio: "ypBase" },
    { key: "ypGroup", label: "青職排聚", cat: "青職", short: "排聚", col: "AD", group: "青職", ratio: "ypBase" },
    { key: "csBase", label: "大專基數", cat: "大專", short: "基數", col: "AE", group: "大專", agg: "last", fixed: true, baseLabel: "大專" },
    { key: "csSunday", label: "大專主日", cat: "大專", short: "主日", col: "AF", group: "大專", ratio: "csBase" },
    { key: "csHome", label: "大專家聚", cat: "大專", short: "家聚", col: "AG", group: "大專", ratio: "csBase" },
    { key: "csGroup", label: "大專排聚", cat: "大專", short: "排聚", col: "AH", group: "大專", ratio: "csBase" },
    { key: "hsBase", label: "國高中基數", cat: "國高中", short: "基數", col: "AI", group: "國高中", agg: "last", fixed: true, baseLabel: "國高中" },
    { key: "hsSunday", label: "國高中主日", cat: "國高中", short: "主日", col: "AJ", group: "國高中", ratio: "hsBase" },
    { key: "hsHome", label: "國高中家聚", cat: "國高中", short: "家聚", col: "AK", group: "國高中", ratio: "hsBase" },
    { key: "hsGroup", label: "國高中排聚", cat: "國高中", short: "排聚", col: "AL", group: "國高中", ratio: "hsBase" },
    // 以下細分欄位只在「數據輸入區」（AY 欄是小區名稱），用名稱對應
    { key: "jhSunday", label: "國中主日", cat: "國中", short: "主日", col: "CA", input: true, group: "國中" },
    { key: "jhHomeOut", label: "國中家聚出訪", cat: "國中", short: "家聚出訪", col: "CB", input: true, group: "國中" },
    { key: "jhHomeIn", label: "國中家聚受訪", cat: "國中", short: "家聚受訪", col: "CC", input: true, group: "國中" },
    { key: "jhHome", label: "國中家聚", cat: "國中", short: "家聚", group: "國中", sumOf: ["jhHomeOut", "jhHomeIn"], note: "出訪＋受訪" },
    { key: "jhGroup", label: "國中排聚", cat: "國中", short: "排聚", col: "CD", input: true, group: "國中" },
    { key: "shSunday", label: "高中主日", cat: "高中", short: "主日", col: "CE", input: true, group: "高中" },
    { key: "shHomeOut", label: "高中家聚出訪", cat: "高中", short: "家聚出訪", col: "CF", input: true, group: "高中" },
    { key: "shHomeIn", label: "高中家聚受訪", cat: "高中", short: "家聚受訪", col: "CG", input: true, group: "高中" },
    { key: "shHome", label: "高中家聚", cat: "高中", short: "家聚", group: "高中", sumOf: ["shHomeOut", "shHomeIn"], note: "出訪＋受訪" },
    { key: "shGroup", label: "高中排聚", cat: "高中", short: "排聚", col: "CH", input: true, group: "高中" },

    { key: "drCount", label: "得少人數", cat: "得少", short: "人數", col: "AM", group: "得少", agg: "last", fixed: true },
    { key: "drCountEs", label: "得少人數・小學", cat: "得少", short: "人數・小學", col: "CI", input: true, group: "得少", agg: "last", fixed: true },
    { key: "drCountJh", label: "得少人數・國中", cat: "得少", short: "人數・國中", col: "CJ", input: true, group: "得少", agg: "last", fixed: true },
    { key: "drCountSh", label: "得少人數・高中", cat: "得少", short: "人數・高中", col: "CK", input: true, group: "得少", agg: "last", fixed: true },
    { key: "drSunday", label: "得少主日", cat: "得少", short: "主日", col: "AN", group: "得少" },
    { key: "drSundayEs", label: "得少主日・小學", cat: "得少", short: "主日・小學", col: "CL", input: true, group: "得少" },
    { key: "drSundayJh", label: "得少主日・國中", cat: "得少", short: "主日・國中", col: "CM", input: true, group: "得少" },
    { key: "drSundaySh", label: "得少主日・高中", cat: "得少", short: "主日・高中", col: "CN", input: true, group: "得少" },
    { key: "drHome", label: "得少受訪", cat: "得少", short: "受訪", col: "AO", group: "得少" },
    { key: "drHomeEs", label: "得少受訪・小學", cat: "得少", short: "受訪・小學", col: "CO", input: true, group: "得少" },
    { key: "drHomeJh", label: "得少受訪・國中", cat: "得少", short: "受訪・國中", col: "CP", input: true, group: "得少" },
    { key: "drHomeSh", label: "得少受訪・高中", cat: "得少", short: "受訪・高中", col: "CQ", input: true, group: "得少" },

    { key: "chRoster", label: "兒童名冊", cat: "兒童主日", short: "名冊", col: "AP", group: "兒童", agg: "last" },
    { key: "chBase", label: "兒童基數", cat: "兒童主日", short: "基數", col: "AQ", group: "兒童", agg: "last", fixed: true, baseLabel: "兒童" },
    { key: "chSunday", label: "兒童主日", cat: "兒童主日", short: "主日", col: "AR", group: "兒童", ratio: "chBase" },
    { key: "chGroupCount", label: "兒童排數", cat: "兒童排", short: "排數", col: "AS", group: "兒童", agg: "last", fixed: true },
    { key: "chAll", label: "兒童排兒童全部", cat: "兒童排", short: "兒童全部", col: "AT", group: "兒童", ratio: "chBase" },
    { key: "chGospel", label: "兒童排福音兒童", cat: "兒童排", short: "福音兒童", col: "AU", group: "兒童" },
    { key: "chAdults", label: "兒童排大人全部", cat: "兒童排", short: "大人全部", col: "AV", group: "兒童" },
    { key: "chParents", label: "兒童排福音家長", cat: "兒童排", short: "福音家長", col: "AW", group: "兒童" }
  ];

  var FIELD_BY_KEY = {};
  FIELDS.forEach(function (f) { FIELD_BY_KEY[f.key] = f; });
  var GROUPS = [];
  FIELDS.forEach(function (f) { if (GROUPS.indexOf(f.group) < 0) GROUPS.push(f.group); });

  var RAW_FIELDS = FIELDS.filter(function (f) { return f.col; });
  var TOTAL_NAME = "雲嘉總計";

  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }
  RAW_FIELDS.forEach(function (f) { f.c = colIndex(f.col); });
  var INPUT_NAME_COL = colIndex("AY");

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function cellAt(ws, r, c) {
    var ref = colLetters(c) + (r + 1);
    return ws[ref];
  }

  function colLetters(c) {
    var s = "";
    c += 1;
    while (c > 0) {
      var m = (c - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      c = Math.floor((c - 1) / 26);
    }
    return s;
  }

  function textOf(cell) {
    if (!cell || cell.v == null) return "";
    return String(cell.v).replace(/\s+/g, "").trim();
  }

  function numOf(cell) {
    if (!cell || cell.t === "e") return null;
    if (typeof cell.v === "number" && isFinite(cell.v)) return cell.v;
    if (typeof cell.v === "string") {
      var s = cell.v.trim();
      if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    }
    return null;
  }

  // Excel 序號日期 → YYYY-MM-DD
  function serialToIso(serial) {
    var ms = Math.round((serial - 25569) * 86400000);
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function dateOf(cell) {
    if (!cell) return null;
    if (cell.v instanceof Date) {
      var d = cell.v;
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }
    if (typeof cell.v === "number" && cell.v > 30000 && cell.v < 80000) return serialToIso(cell.v);
    if (typeof cell.v === "string") {
      var m = cell.v.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
      if (m) return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
    }
    return null;
  }

  // 分頁名稱是主日日期 MMDD；年份取 L2（週日）儲存格，取不到就用 fallbackYear
  function sundayOf(ws, sheetName, fallbackYear) {
    var mm = +sheetName.slice(0, 2);
    var dd = +sheetName.slice(2, 4);
    var fromCell = dateOf(ws["L2"]);
    if (fromCell && +fromCell.slice(5, 7) === mm && +fromCell.slice(8, 10) === dd) return fromCell;
    var year = fromCell ? +fromCell.slice(0, 4) : fallbackYear;
    return year + "-" + pad2(mm) + "-" + pad2(dd);
  }

  function parseWeekSheet(ws, sheetName, fallbackYear) {
    var range = ws["!ref"] ? decodeRange(ws["!ref"]) : { e: { r: 60 } };
    var units = [];
    var region = "";
    var inputRow = {};
    for (var ir = 4; ir <= Math.min(range.e.r, 200); ir++) {
      var n = textOf(cellAt(ws, ir, INPUT_NAME_COL));
      if (n && inputRow[n] === undefined) inputRow[n] = ir;
    }
    for (var r = 4; r <= Math.min(range.e.r, 200); r++) {
      var a = textOf(cellAt(ws, r, 0));
      if (a.indexOf("總計") >= 0) break;
      if (a) region = a;
      var name = textOf(cellAt(ws, r, 1));
      if (!name || name === "小計") continue;
      var values = {};
      RAW_FIELDS.forEach(function (f) {
        var row = f.input ? inputRow[name] : r;
        values[f.key] = row === undefined ? null : numOf(cellAt(ws, row, f.c));
      });
      units.push({ region: region, name: name, values: values });
    }
    var sundaySum = 0;
    units.forEach(function (u) { sundaySum += u.values.sunday || 0; });
    var date = sundayOf(ws, sheetName, fallbackYear);
    return {
      sheet: sheetName,
      date: date,
      month: date.slice(0, 7),
      units: units,
      hasData: sundaySum > 0
    };
  }

  function decodeRange(ref) {
    var parts = ref.split(":");
    var end = parts[1] || parts[0];
    var m = end.match(/^([A-Z]+)(\d+)$/);
    return { e: { c: m ? colIndex(m[1]) : 0, r: m ? +m[2] - 1 : 0 } };
  }

  function parseWorkbook(wb, fallbackYear) {
    fallbackYear = fallbackYear || new Date().getFullYear();
    var weeks = [];
    wb.SheetNames.forEach(function (name) {
      if (!/^\d{4}$/.test(name)) return;
      var ws = wb.Sheets[name];
      if (!ws) return;
      weeks.push(parseWeekSheet(ws, name, fallbackYear));
    });
    weeks.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    return weeks;
  }

  // 小區順序：取最後一個有資料的週，沒有就取第一週
  function unitOrder(weeks) {
    var ref = null;
    for (var i = weeks.length - 1; i >= 0; i--) if (weeks[i].hasData) { ref = weeks[i]; break; }
    if (!ref) ref = weeks[0];
    var regions = [];
    if (!ref) return regions;
    ref.units.forEach(function (u) {
      var g = regions[regions.length - 1];
      if (!g || g.region !== u.region) { g = { region: u.region, units: [] }; regions.push(g); }
      g.units.push(u.name);
    });
    return regions;
  }

  function monthsWithData(weeks) {
    var seen = {};
    var list = [];
    weeks.forEach(function (w) {
      if (!w.hasData) return;
      if (!seen[w.month]) { seen[w.month] = { month: w.month, weeks: [] }; list.push(seen[w.month]); }
      seen[w.month].weeks.push(w.date);
    });
    return list;
  }

  function prevMonthKey(month) {
    var y = +month.slice(0, 4);
    var m = +month.slice(5, 7) - 1;
    if (m === 0) { y -= 1; m = 12; }
    return y + "-" + pad2(m);
  }

  function addNullable(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    return a + b;
  }

  function aggregateUnit(mweeks, name) {
    var out = {};
    var reported = 0;
    var unitWeeks = mweeks.map(function (w) {
      for (var i = 0; i < w.units.length; i++) if (w.units[i].name === name) return w.units[i].values;
      return null;
    });
    unitWeeks.forEach(function (v) { if (v && v.sunday != null) reported++; });
    RAW_FIELDS.forEach(function (f) {
      var vals = [];
      unitWeeks.forEach(function (v) { if (v && v[f.key] != null) vals.push(v[f.key]); });
      if (!vals.length) { out[f.key] = null; return; }
      if (f.agg === "last") { out[f.key] = vals[vals.length - 1]; return; }
      var sum = 0;
      vals.forEach(function (x) { sum += x; });
      out[f.key] = sum / vals.length;
    });
    return { values: out, reported: reported };
  }

  function finishDerived(values, prevValues) {
    FIELDS.forEach(function (f) {
      if (f.sumOf) {
        var s = null;
        f.sumOf.forEach(function (k) { s = addNullable(s, values[k]); });
        values[f.key] = s;
      } else if (f.monthDiffOf) {
        var cur = values[f.monthDiffOf];
        var prev = prevValues ? prevValues[f.monthDiffOf] : null;
        values[f.key] = cur != null && prev != null ? cur - prev : null;
      }
    });
    return values;
  }

  function ratiosOf(values) {
    var ratios = {};
    FIELDS.forEach(function (f) {
      if (!f.ratio) return;
      var num = values[f.key];
      var den = values[f.ratio];
      ratios[f.key] = num != null && den ? num / den : null;
    });
    return ratios;
  }

  function sumValues(list) {
    var out = {};
    RAW_FIELDS.forEach(function (f) {
      var s = null;
      list.forEach(function (v) { s = addNullable(s, v[f.key]); });
      out[f.key] = s;
    });
    return out;
  }

  // 只計算原始欄位（不含衍生欄），給 computeMonth 用來取上月底累計
  function rawMonth(weeks, month, order) {
    var mweeks = weeks.filter(function (w) { return w.month === month && w.hasData; });
    if (!mweeks.length) return null;
    var byUnit = {};
    order.forEach(function (g) {
      g.units.forEach(function (name) { byUnit[name] = aggregateUnit(mweeks, name); });
    });
    return { weeks: mweeks, byUnit: byUnit };
  }

  // 計算某月的月報表（各項為當月各週平均）
  function computeMonth(weeks, month) {
    var order = unitOrder(weeks);
    var cur = rawMonth(weeks, month, order);
    if (!cur) return null;
    var prev = rawMonth(weeks, prevMonthKey(month), order);
    var rows = [];
    var regionTotals = [];
    var prevRegionTotals = [];
    order.forEach(function (g) {
      var unitVals = [];
      var prevUnitVals = [];
      var unitRows = [];
      g.units.forEach(function (name) {
        var a = cur.byUnit[name];
        var pv = prev ? prev.byUnit[name].values : null;
        var values = finishDerived(Object.assign({}, a.values), pv);
        unitVals.push(a.values);
        if (pv) prevUnitVals.push(pv);
        unitRows.push({
          type: "unit", region: g.region, name: name,
          values: values, ratios: ratiosOf(values),
          reported: a.reported, weekCount: cur.weeks.length
        });
      });
      var rt = sumValues(unitVals);
      var prt = prev ? sumValues(prevUnitVals) : null;
      regionTotals.push(rt);
      if (prt) prevRegionTotals.push(prt);
      var rv = finishDerived(Object.assign({}, rt), prt);
      rows.push({ type: "region", region: g.region, name: g.region + "小計", values: rv, ratios: ratiosOf(rv) });
      unitRows.forEach(function (u) { rows.push(u); });
    });
    var tt = sumValues(regionTotals);
    var ptt = prev ? sumValues(prevRegionTotals) : null;
    var tv = finishDerived(Object.assign({}, tt), ptt);
    rows.push({ type: "total", region: "", name: TOTAL_NAME, values: tv, ratios: ratiosOf(tv) });
    return {
      month: month,
      weeks: cur.weeks.map(function (w) { return w.date; }),
      rows: rows
    };
  }

  var api = {
    FIELDS: FIELDS,
    FIELD_BY_KEY: FIELD_BY_KEY,
    GROUPS: GROUPS,
    TOTAL_NAME: TOTAL_NAME,
    parseWorkbook: parseWorkbook,
    unitOrder: unitOrder,
    monthsWithData: monthsWithData,
    prevMonthKey: prevMonthKey,
    computeMonth: computeMonth
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YCReport = api;
})(this);
