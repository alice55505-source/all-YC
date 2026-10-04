(function () {
  "use strict";

  var R = window.YCReport;
  var FIELDS = R.FIELDS;
  var FIELD_BY_KEY = R.FIELD_BY_KEY;

  var SETTINGS_KEY = "yc-settings-v1";
  var PRESETS_KEY = "yc-presets-v1";
  var CACHE_KEY = "yc-cache-v1";

  var DEFAULT_SETTINGS = {
    mode: "avg",
    showRatio: true,
    compare: false,
    highlight: true,
    fields: ["base", "sunday", "sundayYP", "prayer", "smallGroup", "gospel", "home", "lifeStudy", "morning", "baptMonth", "baptTotal"],
    preset: ""
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

  // ---------- 範本（全部由使用者自訂，存在這台裝置的瀏覽器） ----------
  var PRESET_KEYS = ["fields", "mode", "showRatio", "compare", "highlight"];

  function presetSnapshot() {
    var p = {};
    PRESET_KEYS.forEach(function (k) { p[k] = Array.isArray(settings[k]) ? settings[k].slice() : settings[k]; });
    return p;
  }

  function findPreset(name) {
    var list = userPresets();
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  function renderPresetSelect() {
    var mine = userPresets();
    if (settings.preset && !findPreset(settings.preset)) settings.preset = "";
    var html = '<option value="">' + (mine.length ? "— 選擇範本 —" : "— 還沒有範本 —") + "</option>";
    mine.forEach(function (p) {
      html += '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + "</option>";
    });
    var sel = $("preset-select");
    sel.innerHTML = html;
    sel.value = settings.preset || "";
    renderPresetState();
  }

  // 目前設定跟選取的範本不同時提示「尚未存入」
  function renderPresetState() {
    var p = settings.preset ? findPreset(settings.preset) : null;
    $("preset-actions").hidden = !p;
    if (!p) return;
    var cur = presetSnapshot();
    var dirty = PRESET_KEYS.some(function (k) { return JSON.stringify(cur[k]) !== JSON.stringify(p[k]); });
    $("preset-dirty").hidden = !dirty;
    $("preset-update-btn").hidden = !dirty;
  }

  function applyPreset(p) {
    settings.fields = p.fields.filter(function (k) { return FIELD_BY_KEY[k]; });
    ["mode", "showRatio", "compare", "highlight"].forEach(function (k) {
      if (p[k] !== undefined) settings[k] = p[k];
    });
    settings.preset = p.name;
    saveSettings();
    syncControls();
    renderAll();
  }

  function writePresets(list) {
    saveJson(PRESETS_KEY, list);
    renderPresetSelect();
  }

  // 項目挑選面板：分頁顯示，青年人與得少用「對象 × 項目」矩陣
  var PICKER_TABS = [
    {
      name: "召會生活",
      chips: [["base", "基數"], ["sunday", "主日"], ["sundayYP", "主日青職"], ["prayer", "禱告"], ["groupCount", "排數"],
        ["smallGroup", "小排"], ["gospel", "福音出訪"], ["home", "家聚會"], ["homeOut", "家聚出訪"], ["homeIn", "家聚受訪"],
        ["lifeStudy", "生命讀經"], ["morning", "晨興"]]
    },
    { name: "受浸", chips: [["baptMonth", "本月受浸"], ["baptTotal", "受浸累計"], ["baptGoal", "受浸目標"]] },
    {
      name: "青年人",
      cols: ["基數", "主日", "家聚", "出訪", "受訪", "排聚"],
      rows: [
        ["青職", ["ypBase", "ypSunday", "ypHome", null, null, "ypGroup"]],
        ["大專", ["csBase", "csSunday", "csHome", null, null, "csGroup"]],
        ["國高中", ["hsBase", "hsSunday", "hsHome", null, null, "hsGroup"]],
        ["國中", [null, "jhSunday", "jhHome", "jhHomeOut", "jhHomeIn", "jhGroup"]],
        ["高中", [null, "shSunday", "shHome", "shHomeOut", "shHomeIn", "shGroup"]]
      ]
    },
    {
      name: "得少",
      cols: ["人數", "主日", "受訪"],
      rows: [
        ["合計", ["drCount", "drSunday", "drHome"]],
        ["小學", ["drCountEs", "drSundayEs", "drHomeEs"]],
        ["國中", ["drCountJh", "drSundayJh", "drHomeJh"]],
        ["高中", ["drCountSh", "drSundaySh", "drHomeSh"]]
      ]
    },
    {
      name: "兒童",
      chips: [["chRoster", "名冊"], ["chBase", "基數"], ["chSunday", "主日"], ["chGroupCount", "排數"],
        ["chAll", "兒童排・兒童全部"], ["chGospel", "兒童排・福音兒童"], ["chAdults", "兒童排・大人全部"], ["chParents", "兒童排・福音家長"]]
    }
  ];
  var pickerTab = 0;
  var ordering = false;

  function tabKeys(tab) {
    if (tab.chips) return tab.chips.map(function (c) { return c[0]; });
    var keys = [];
    tab.rows.forEach(function (r) { r[1].forEach(function (k) { if (k) keys.push(k); }); });
    return keys;
  }

  function isOn(key) { return settings.fields.indexOf(key) >= 0; }

  function renderFieldPicker() {
    $("picker-tabs").innerHTML = PICKER_TABS.map(function (t, i) {
      var n = tabKeys(t).filter(isOn).length;
      return '<button class="picker-tab' + (i === pickerTab ? " active" : "") + '" data-tab="' + i + '">' + t.name +
        (n ? '<span class="tab-count">' + n + "</span>" : "") + "</button>";
    }).join("");

    var tab = PICKER_TABS[pickerTab];
    var html = '<div class="picker-tools"><button class="link-btn" data-tab-all="1">本頁全選／全不選</button></div>';
    if (tab.chips) {
      html += '<div class="chip-grid">';
      tab.chips.forEach(function (c) {
        var f = FIELD_BY_KEY[c[0]];
        html += '<label class="chip-check' + (isOn(c[0]) ? " on" : "") + '" title="' + escapeHtml(f.note || "") + '">' +
          '<input type="checkbox" data-field="' + c[0] + '"' + (isOn(c[0]) ? " checked" : "") + " />" + escapeHtml(c[1]) + "</label>";
      });
      html += "</div>";
    } else {
      html += '<div class="table-scroll"><table class="matrix"><thead><tr><th></th>' +
        tab.cols.map(function (c, ci) { return '<th><button class="link-btn" data-col="' + ci + '">' + c + "</button></th>"; }).join("") +
        "</tr></thead><tbody>";
      tab.rows.forEach(function (r, ri) {
        html += '<tr><th><button class="link-btn" data-row="' + ri + '">' + r[0] + "</button></th>";
        r[1].forEach(function (k) {
          html += k
            ? '<td><label class="matrix-cell' + (isOn(k) ? " on" : "") + '"><input type="checkbox" data-field="' + k + '"' +
              (isOn(k) ? " checked" : "") + " /></label></td>"
            : '<td class="na">—</td>';
        });
        html += "</tr>";
      });
      html += "</tbody></table></div><p class=\"modal-hint\">點列名或欄名可整列／整欄勾選</p>";
    }
    $("picker-body").innerHTML = html;
  }

  function renderPicked() {
    var fields = selectedFields();
    $("picked-count").textContent = fields.length ? "已選 " + fields.length + " 項" : "尚未選擇";
    $("picked-chips").classList.toggle("ordering", ordering);
    $("order-toggle").textContent = ordering ? "完成排序" : "調整順序";
    $("order-toggle").hidden = fields.length < 2 && !ordering;
    $("picked-chips").innerHTML = fields.map(function (f, i) {
      var label = escapeHtml(f.label);
      if (ordering) {
        return '<span class="picked-chip">' +
          '<button data-move="' + i + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="往前">‹</button>' + label +
          '<button data-move="' + i + '" data-dir="1"' + (i === fields.length - 1 ? " disabled" : "") + ' aria-label="往後">›</button></span>';
      }
      return '<span class="picked-chip">' + label +
        '<button data-remove="' + f.key + '" title="移除" aria-label="移除 ' + label + '">×</button></span>';
    }).join("");
  }

  function toggleKeys(keys) {
    var allOn = keys.every(isOn);
    settings.fields = settings.fields.filter(function (k) { return keys.indexOf(k) < 0; });
    if (!allOn) settings.fields = settings.fields.concat(keys);
    fieldsChanged();
  }

  function fieldsChanged() {
    saveSettings();
    syncControls();
    renderAll();
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
    renderFieldPicker();
    renderPicked();
    renderPresetState();
  }

  // 報表欄位順序 = 使用者選取／排列的順序
  function selectedFields() {
    return settings.fields.map(function (k) { return FIELD_BY_KEY[k]; }).filter(Boolean);
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
        out.push(row);
      } else {
        if (pending) out.push(pending);
        pending = null;
        out.push(row);
      }
    });
    return out;
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
    renderPresetState();
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

    $("picker-toggle").addEventListener("click", function () {
      var panel = $("field-picker");
      panel.hidden = !panel.hidden;
      $("picker-toggle").textContent = panel.hidden ? "＋ 編輯項目" : "完成";
    });
    $("order-toggle").addEventListener("click", function () {
      ordering = !ordering;
      renderPicked();
    });
    $("picked-chips").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      var key = btn.getAttribute("data-remove");
      if (key) {
        settings.fields = settings.fields.filter(function (k) { return k !== key; });
      } else if (btn.hasAttribute("data-move")) {
        var list = selectedFields().map(function (f) { return f.key; });
        var i = +btn.getAttribute("data-move");
        var j = i + +btn.getAttribute("data-dir");
        if (j < 0 || j >= list.length) return;
        var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
        settings.fields = list;
      } else {
        return;
      }
      fieldsChanged();
    });
    $("field-picker").addEventListener("change", function (e) {
      var key = e.target.getAttribute("data-field");
      if (!key) return;
      var set = settings.fields.filter(function (k) { return k !== key; });
      if (e.target.checked) set.push(key);
      settings.fields = set;
      fieldsChanged();
    });
    $("field-picker").addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t) return;
      var tab = PICKER_TABS[pickerTab];
      if (t.hasAttribute("data-tab")) {
        pickerTab = +t.getAttribute("data-tab");
        renderFieldPicker();
      } else if (t.hasAttribute("data-tab-all")) {
        toggleKeys(tabKeys(tab));
      } else if (t.hasAttribute("data-row")) {
        toggleKeys(tab.rows[+t.getAttribute("data-row")][1].filter(Boolean));
      } else if (t.hasAttribute("data-col")) {
        var ci = +t.getAttribute("data-col");
        toggleKeys(tab.rows.map(function (r) { return r[1][ci]; }).filter(Boolean));
      }
    });

    $("preset-select").addEventListener("change", function (e) {
      var p = findPreset(e.target.value);
      if (p) {
        applyPreset(p);
      } else {
        settings.preset = "";
        saveSettings();
        renderPresetState();
      }
    });
    $("preset-save-btn").addEventListener("click", function () {
      var name = (prompt("新範本名稱（例如：長老月會用）") || "").trim();
      if (!name) return;
      var list = userPresets();
      if (findPreset(name) && !confirm("已有範本「" + name + "」，要覆蓋嗎？")) return;
      list = list.filter(function (p) { return p.name !== name; });
      var snap = presetSnapshot();
      snap.name = name;
      list.push(snap);
      settings.preset = name;
      saveSettings();
      writePresets(list);
      showStatus("已存成範本「" + name + "」（存在這台裝置的瀏覽器裡）", "ok");
    });
    $("preset-update-btn").addEventListener("click", function () {
      var name = settings.preset;
      var list = userPresets().map(function (p) {
        if (p.name !== name) return p;
        var snap = presetSnapshot();
        snap.name = name;
        return snap;
      });
      writePresets(list);
      showStatus("已更新範本「" + name + "」", "ok");
    });
    $("preset-rename-btn").addEventListener("click", function () {
      var old = settings.preset;
      var name = (prompt("範本新名稱", old) || "").trim();
      if (!name || name === old) return;
      if (findPreset(name)) { alert("已有同名範本「" + name + "」"); return; }
      var list = userPresets().map(function (p) {
        if (p.name === old) p.name = name;
        return p;
      });
      settings.preset = name;
      saveSettings();
      writePresets(list);
    });
    $("preset-delete-btn").addEventListener("click", function () {
      var name = settings.preset;
      if (!name || !confirm("刪除範本「" + name + "」？")) return;
      settings.preset = "";
      saveSettings();
      writePresets(userPresets().filter(function (p) { return p.name !== name; }));
    });

    $("download-btn").addEventListener("click", downloadExcel);
    $("print-btn").addEventListener("click", function () { window.print(); });
  }

  // ---------- 啟動 ----------
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
