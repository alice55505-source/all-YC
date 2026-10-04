(function () {
  "use strict";

  var R = window.YCReport;
  var FIELDS = R.FIELDS;
  var FIELD_BY_KEY = R.FIELD_BY_KEY;

  var SETTINGS_KEY = "yc-settings-v1";
  var PRESETS_KEY = "yc-presets-v1";
  var CACHE_KEY = "yc-cache-v1";

  var BUILTIN_PRESETS = [
    {
      name: "召會生活月報",
      fields: ["base", "sunday", "sundayYP", "prayer", "smallGroup", "gospel", "home", "lifeStudy", "morning", "baptMonth", "baptTotal"]
    },
    {
      name: "青年人月報",
      fields: ["ypBase", "ypSunday", "ypHome", "ypGroup", "csBase", "csSunday", "csHome", "csGroup", "hsBase", "hsSunday", "hsHome", "hsGroup", "drSunday", "drHome"]
    },
    {
      name: "兒童月報",
      fields: ["chRoster", "chBase", "chSunday", "chGroupCount", "chAll", "chGospel", "chAdults", "chParents"]
    }
  ];

  var DEFAULT_SETTINGS = {
    mode: "avg",
    level: "unit",
    showRatio: true,
    compare: false,
    highlight: true,
    fields: BUILTIN_PRESETS[0].fields.slice()
  };

  var weeks = [];
  var months = [];
  var currentMonth = null;
  var settings = loadJson(SETTINGS_KEY, null) || {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (settings[k] === undefined) settings[k] = DEFAULT_SETTINGS[k];
  });
  settings.fields = settings.fields.filter(function (k) { return FIELD_BY_KEY[k]; });

  var $ = function (id) { return document.getElementById(id); };

  // ---------- 儲存 ----------
  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 私密模式等情況忽略 */ }
  }

  function saveSettings() { saveJson(SETTINGS_KEY, settings); }

  function userPresets() { return loadJson(PRESETS_KEY, []) || []; }

  // ---------- 格式 ----------
  function fmtNum(v, field) {
    if (v == null) return "—";
    if (field && field.agg === "last") return String(Math.round(v));
    var r = Math.round(v * 10) / 10;
    return String(r);
  }

  function fmtPct(v) {
    if (v == null) return "—";
    return (Math.round(v * 1000) / 10) + "%";
  }

  function fmtDelta(v) {
    if (v == null) return "—";
    var r = Math.round(v * 10) / 10;
    if (r > 0) return "+" + r;
    return String(r);
  }

  function md(iso) { return +iso.slice(5, 7) + "/" + +iso.slice(8, 10); }

  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function monthLabel(m) { return m.slice(0, 4) + " 年 " + +m.slice(5, 7) + " 月"; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function showStatus(msg, kind) {
    var el = $("status-msg");
    if (!msg) { el.className = "status-msg no-print"; el.textContent = ""; return; }
    el.className = "status-msg show no-print " + (kind || "ok");
    el.textContent = msg;
  }

  // ---------- 資料載入 ----------
  function setSource(info) {
    var link = $("source-link");
    if (info.sheetId) {
      link.href = "https://docs.google.com/spreadsheets/d/" + info.sheetId + "/edit";
      link.textContent = info.title || "Google 試算表";
    } else {
      link.removeAttribute("href");
      link.textContent = info.title || "上傳的檔案";
    }
    $("source-time").textContent = info.fetchedAt
      ? "更新時間 " + new Date(info.fetchedAt).toLocaleString("zh-TW", { hour12: false })
      : "";
  }

  function useWeeks(newWeeks) {
    weeks = newWeeks;
    months = R.monthsWithData(weeks);
    if (!months.length) {
      $("app-main").style.display = "none";
      showStatus("試算表裡還沒有任何一週有資料。", "error");
      return;
    }
    var keys = months.map(function (m) { return m.month; });
    if (!currentMonth || keys.indexOf(currentMonth) < 0) currentMonth = keys[keys.length - 1];
    $("app-main").style.display = "";
    renderMonthSelect();
    renderAll();
  }

  function parseBuffer(buf) {
    var wb = XLSX.read(buf, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false });
    var parsed = R.parseWorkbook(wb, new Date().getFullYear());
    if (!parsed.length) throw new Error("找不到週報分頁（分頁名稱要是 4 位數字的主日日期，例如 1004）");
    return parsed;
  }

  function fetchSheet(refresh) {
    $("refresh-btn").disabled = true;
    showStatus(refresh ? "重新抓取試算表中…" : "抓取試算表中…", "ok");
    return fetch("/api/sheet" + (refresh ? "?refresh=1" : ""), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.error || "伺服器回應 HTTP " + res.status);
          });
        }
        var info = {
          sheetId: res.headers.get("X-Sheet-Id") || "",
          title: decodeURIComponent(res.headers.get("X-Sheet-Title") || ""),
          fetchedAt: res.headers.get("X-Fetched-At") || new Date().toISOString()
        };
        return res.arrayBuffer().then(function (buf) { return { info: info, buf: buf }; });
      })
      .then(function (r) {
        var parsed = parseBuffer(r.buf);
        setSource(r.info);
        saveJson(CACHE_KEY, { info: r.info, weeks: parsed });
        useWeeks(parsed);
        showStatus("");
      })
      .catch(function (e) {
        showStatus("抓取失敗：" + e.message + (weeks.length ? "（目前顯示的是上次抓到的資料）" : ""), "error");
      })
      .then(function () { $("refresh-btn").disabled = false; });
  }

  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = parseBuffer(new Uint8Array(reader.result));
        setSource({ title: "上傳的檔案：" + file.name, fetchedAt: new Date().toISOString() });
        useWeeks(parsed);
        showStatus("已改用上傳的檔案。按「重新抓取」可回到 Google 試算表。", "ok");
      } catch (e) {
        showStatus("檔案解析失敗：" + e.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- 設定區 ----------
  function renderMonthSelect() {
    var sel = $("month-select");
    sel.innerHTML = months.slice().reverse().map(function (m) {
      return '<option value="' + m.month + '">' + monthLabel(m.month) + "（" + m.weeks.length + " 週）</option>";
    }).join("");
    sel.value = currentMonth;
  }

  function renderPresetSelect() {
    var sel = $("preset-select");
    var html = '<option value="">— 選擇範本 —</option><optgroup label="內建">';
    BUILTIN_PRESETS.forEach(function (p, i) { html += '<option value="b' + i + '">' + escapeHtml(p.name) + "</option>"; });
    html += "</optgroup>";
    var mine = userPresets();
    if (mine.length) {
      html += '<optgroup label="我的範本">';
      mine.forEach(function (p, i) { html += '<option value="u' + i + '">' + escapeHtml(p.name) + "</option>"; });
      html += "</optgroup>";
    }
    sel.innerHTML = html;
    $("preset-delete-btn").style.visibility = "hidden";
  }

  function applyPreset(p) {
    settings.fields = p.fields.filter(function (k) { return FIELD_BY_KEY[k]; });
    ["mode", "level", "showRatio", "compare", "highlight"].forEach(function (k) {
      if (p[k] !== undefined) settings[k] = p[k];
    });
    saveSettings();
    syncControls();
    renderAll();
  }

  function renderFieldPicker() {
    var html = "";
    R.GROUPS.forEach(function (g) {
      var fs = FIELDS.filter(function (f) { return f.group === g; });
      html += '<div class="picker-group"><div class="picker-head"><span>' + g + '</span>' +
        '<button class="link-btn" data-group-toggle="' + g + '">全選／全不選</button></div><div class="chip-grid">';
      fs.forEach(function (f) {
        html += '<label class="chip-check" title="' + escapeHtml(f.note || "") + '"><input type="checkbox" data-field="' + f.key + '" />' +
          escapeHtml(f.label) + "</label>";
      });
      html += "</div></div>";
    });
    $("field-picker").innerHTML = html;
  }

  function syncControls() {
    document.querySelectorAll(".seg").forEach(function (seg) {
      var key = seg.getAttribute("data-setting");
      seg.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-value") === settings[key]);
      });
    });
    document.querySelectorAll("input[data-setting]").forEach(function (el) {
      el.checked = !!settings[el.getAttribute("data-setting")];
    });
    document.querySelectorAll("input[data-field]").forEach(function (el) {
      el.checked = settings.fields.indexOf(el.getAttribute("data-field")) >= 0;
      el.parentNode.classList.toggle("on", el.checked);
    });
  }

  function selectedFields() {
    return FIELDS.filter(function (f) { return settings.fields.indexOf(f.key) >= 0; });
  }

  // ---------- 月報表 ----------
  function subColumns(f) {
    var cols = [{ kind: "value", label: settings.mode === "sum" && f.agg !== "last" && !f.monthDiffOf ? "合計" : "人數" }];
    if (settings.showRatio && f.ratio) cols.push({ kind: "ratio", label: "佔比" });
    if (settings.compare) cols.push({ kind: "delta", label: "較上月" });
    return cols;
  }

  function orderedRows(report) {
    var out = [];
    var pending = null;
    report.rows.forEach(function (row) {
      if (row.type === "region") {
        if (pending) out.push(pending);
        pending = row;
      } else if (row.type === "unit") {
        if (settings.level === "unit") out.push(row);
      } else {
        if (pending) out.push(pending);
        pending = null;
        out.push(row);
      }
    });
    return out.filter(function (row) {
      if (settings.level === "total") return row.type === "total";
      if (settings.level === "region") return row.type !== "unit";
      return true;
    });
  }

  function buildReport() {
    var report = R.computeMonth(weeks, currentMonth, settings.mode);
    var prev = R.computeMonth(weeks, R.prevMonthKey(currentMonth), settings.mode);
    var prevByName = {};
    if (prev) prev.rows.forEach(function (r) { prevByName[r.type + ":" + r.name] = r; });
    var fields = selectedFields();
    var rows = orderedRows(report).map(function (row) {
      var p = prevByName[row.type + ":" + row.name];
      var cells = [];
      fields.forEach(function (f) {
        subColumns(f).forEach(function (c) {
          var v = null;
          var green = false;
          if (c.kind === "value") {
            v = row.values[f.key];
            green = settings.highlight && R.isGreen(f, row.ratios[f.key]);
          } else if (c.kind === "ratio") {
            v = row.ratios[f.key];
            green = settings.highlight && R.isGreen(f, v);
          } else if (p && row.values[f.key] != null && p.values[f.key] != null) {
            v = row.values[f.key] - p.values[f.key];
          }
          cells.push({ kind: c.kind, field: f, value: v, green: green });
        });
      });
      return { row: row, cells: cells };
    });
    return { report: report, fields: fields, rows: rows, hasPrev: !!prev };
  }

  function rowLabel(row) {
    var label = row.name;
    if (row.type === "unit" && row.reported < row.weekCount) {
      label += "（" + row.reported + "/" + row.weekCount + " 週）";
    }
    return label;
  }

  function renderReport() {
    var built = buildReport();
    var report = built.report;
    var w = report.weeks;
    $("report-title").textContent = monthLabel(currentMonth) + " 雲嘉眾召會月報表";
    $("report-badge").textContent = settings.mode === "sum" ? "合計" : "週平均";
    $("report-sub").textContent = "主日 " + w.map(md).join("、") + "，共 " + w.length + " 週（" +
      md(addDays(w[0], -6)) + "～" + md(w[w.length - 1]) + "）" +
      (settings.compare && !built.hasPrev ? "　※ 上個月沒有資料，無法比較增減" : "");

    var table = $("report-table");
    if (!built.fields.length) {
      table.innerHTML = "";
      $("report-empty").style.display = "";
      $("download-btn").disabled = true;
      return;
    }
    $("report-empty").style.display = "none";
    $("download-btn").disabled = false;

    var multi = built.fields.some(function (f) { return subColumns(f).length > 1; });
    var head1 = '<tr><th rowspan="' + (multi ? 2 : 1) + '" class="sticky-col">大區／小區</th>';
    var head2 = "<tr>";
    built.fields.forEach(function (f) {
      var subs = subColumns(f);
      if (multi) {
        head1 += '<th colspan="' + subs.length + '" class="group-th">' + escapeHtml(f.label) + "</th>";
        subs.forEach(function (c) { head2 += "<th>" + c.label + "</th>"; });
      } else {
        head1 += "<th>" + escapeHtml(f.label) + "</th>";
      }
    });
    head1 += "</tr>";
    head2 += "</tr>";

    var body = built.rows.map(function (r) {
      var cls = r.row.type === "unit" ? "" : r.row.type === "region" ? "region-row" : "total-row";
      var html = '<tr class="' + cls + '"><td class="sticky-col' + (r.row.type === "unit" ? " congregation-name" : "") + '">' +
        escapeHtml(rowLabel(r.row)) + "</td>";
      r.cells.forEach(function (c) {
        var text = c.kind === "ratio" ? fmtPct(c.value) : c.kind === "delta" ? fmtDelta(c.value) : fmtNum(c.value, c.field);
        var cl = [];
        if (c.green) cl.push("ok");
        if (c.kind === "delta" && c.value != null) cl.push(c.value > 0 ? "up" : c.value < 0 ? "down" : "");
        if (c.kind !== "value") cl.push("sub");
        html += '<td class="' + cl.join(" ") + '">' + text + "</td>";
      });
      return html + "</tr>";
    }).join("");

    table.innerHTML = "<thead>" + head1 + (multi ? head2 : "") + "</thead><tbody>" + body + "</tbody>";
  }

  function downloadExcel() {
    var built = buildReport();
    var title = monthLabel(currentMonth) + " 雲嘉眾召會月報表（" + (settings.mode === "sum" ? "合計" : "週平均") + "）";
    var aoa = [[title], ["主日：" + built.report.weeks.map(md).join("、")], []];
    var h1 = ["大區／小區"];
    var h2 = [""];
    built.fields.forEach(function (f) {
      subColumns(f).forEach(function (c, i) {
        h1.push(i === 0 ? f.label : "");
        h2.push(c.kind === "ratio" ? "佔比(%)" : c.label);
      });
    });
    aoa.push(h1, h2);
    built.rows.forEach(function (r) {
      var line = [rowLabel(r.row)];
      r.cells.forEach(function (c) {
        if (c.value == null) { line.push(""); return; }
        var v = c.kind === "ratio" ? c.value * 100 : c.value;
        line.push(Math.round(v * 10) / 10);
      });
      aoa.push(line);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 16 }].concat(h1.slice(1).map(function () { return { wch: 9 }; }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, currentMonth);
    XLSX.writeFile(wb, "雲嘉月報表_" + currentMonth + ".xlsx");
  }

  function renderAll() {
    if (!weeks.length || !currentMonth) return;
    renderReport();
  }

  // ---------- 事件 ----------
  function bindEvents() {
    $("refresh-btn").addEventListener("click", function () { fetchSheet(true); });
    $("file-input").addEventListener("change", function (e) {
      if (e.target.files[0]) loadFile(e.target.files[0]);
      e.target.value = "";
    });
    $("month-select").addEventListener("change", function (e) { currentMonth = e.target.value; renderAll(); });

    document.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        settings[b.parentNode.getAttribute("data-setting")] = b.getAttribute("data-value");
        saveSettings();
        syncControls();
        renderAll();
      });
    });
    document.querySelectorAll("input[data-setting]").forEach(function (el) {
      el.addEventListener("change", function () {
        settings[el.getAttribute("data-setting")] = el.checked;
        saveSettings();
        renderAll();
      });
    });

    $("field-picker").addEventListener("change", function (e) {
      var key = e.target.getAttribute("data-field");
      if (!key) return;
      var set = settings.fields.filter(function (k) { return k !== key; });
      if (e.target.checked) set.push(key);
      settings.fields = set;
      saveSettings();
      syncControls();
      renderAll();
    });
    $("field-picker").addEventListener("click", function (e) {
      var g = e.target.getAttribute("data-group-toggle");
      if (!g) return;
      var keys = FIELDS.filter(function (f) { return f.group === g; }).map(function (f) { return f.key; });
      var allOn = keys.every(function (k) { return settings.fields.indexOf(k) >= 0; });
      settings.fields = settings.fields.filter(function (k) { return keys.indexOf(k) < 0; });
      if (!allOn) settings.fields = settings.fields.concat(keys);
      saveSettings();
      syncControls();
      renderAll();
    });

    $("preset-select").addEventListener("change", function (e) {
      var v = e.target.value;
      $("preset-delete-btn").style.visibility = v.charAt(0) === "u" ? "visible" : "hidden";
      if (!v) return;
      var p = v.charAt(0) === "b" ? BUILTIN_PRESETS[+v.slice(1)] : userPresets()[+v.slice(1)];
      if (p) applyPreset(p);
    });
    $("preset-save-btn").addEventListener("click", function () {
      var name = (prompt("範本名稱（例如：長老月會用）") || "").trim();
      if (!name) return;
      var list = userPresets().filter(function (p) { return p.name !== name; });
      list.push({
        name: name, fields: settings.fields.slice(), mode: settings.mode, level: settings.level,
        showRatio: settings.showRatio, compare: settings.compare, highlight: settings.highlight
      });
      saveJson(PRESETS_KEY, list);
      renderPresetSelect();
      $("preset-select").value = "u" + (list.length - 1);
      $("preset-delete-btn").style.visibility = "visible";
      showStatus("已存成範本「" + name + "」（存在這台裝置的瀏覽器裡）", "ok");
    });
    $("preset-delete-btn").addEventListener("click", function () {
      var v = $("preset-select").value;
      if (v.charAt(0) !== "u") return;
      var list = userPresets();
      var p = list[+v.slice(1)];
      if (!p || !confirm("刪除範本「" + p.name + "」？")) return;
      list.splice(+v.slice(1), 1);
      saveJson(PRESETS_KEY, list);
      renderPresetSelect();
    });

    $("download-btn").addEventListener("click", downloadExcel);
    $("print-btn").addEventListener("click", function () { window.print(); });
  }

  // ---------- 啟動 ----------
  renderFieldPicker();
  renderPresetSelect();
  syncControls();
  bindEvents();

  var cached = loadJson(CACHE_KEY, null);
  if (cached && cached.weeks && cached.weeks.length) {
    setSource(cached.info || {});
    useWeeks(cached.weeks);
  }
  fetchSheet(false);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 不影響主功能 */ });
    });
  }
})();
