<script>
(function () {
  if (window.__callaiHostPanel) return;
  window.__callaiHostPanel = true;

  var PREFS_KEY = "__callai_host__/prefs";
  var PARAMS_KEY = "__callai_host__/params";
  var PANEL_KEY = "__callai_host__/panel";
  var SNAP = 28;
  var MARGIN = 12;
  var BAR_H = 44;
  var BAR_W_FALLBACK = 168;

  var defaults = {
    theme: "light",
    notifications: true,
  };

  var prefs = Object.assign({}, defaults);
  var hostParams = {};
  var panelPos = null; // anchors: snapX/snapY + xFrac/yFrac
  var dragOrient = null; // "vertical"|"horizontal" while dragging
  var dragging = false;
  var dragOffset = { x: 0, y: 0 };
  var moved = false;

  function $(id) { return document.getElementById(id); }

  function applyTheme() {
    var root = document.documentElement;
    if (prefs.theme === "dark") root.classList.add("callai-theme-dark");
    else root.classList.remove("callai-theme-dark");
    // Notify parent plugin window so TitleBar / shell match (outside iframe).
    try {
      var target =
        window.parent && window.parent !== window ? window.parent : window;
      target.postMessage(
        {
          __callai_plugin_theme: true,
          pluginId: (window.callai && window.callai.pluginId) || "",
          theme: prefs.theme === "dark" ? "dark" : "light",
        },
        "*",
      );
    } catch (e) {}
  }

  function alarmLaunchOnly() {
    var alarm = window.callai.launchParams || {};
    return alarm && typeof alarm === "object" && !Array.isArray(alarm) ? alarm : {};
  }

  function mergeLaunchParams() {
    // effective = plugin settings (hostParams) then alarm runtime overrides
    return Object.assign({}, hostParams, alarmLaunchOnly());
  }

  function alarmOverrideEntries() {
    var alarm = alarmLaunchOnly();
    var out = [];
    Object.keys(alarm).forEach(function (k) {
      var v = alarm[k];
      if (v == null || v === "") return;
      // host-reserved keys are not business overrides
      if (k === "theme" || k === "notifications" || k.indexOf("__") === 0) return;
      out.push([k, v]);
    });
    return out;
  }

  function syncOverrideBadge() {
    var btn = $("ch-bar-override");
    if (!btn) return;
    var entries = alarmOverrideEntries();
    if (!entries.length) {
      btn.hidden = true;
      btn.classList.remove("is-on");
      btn.title = "本次闹钟参数";
      return;
    }
    btn.hidden = false;
    btn.classList.add("is-on");
    btn.title =
      "本次闹钟临时参数（不写回设置）：\n" +
      entries.map(function (e) {
        return e[0] + "=" + String(e[1]);
      }).join("\n");
  }

  function renderOverridePanel() {
    var box = $("ch-override-list");
    if (!box) return;
    box.innerHTML = "";
    var entries = alarmOverrideEntries();
    if (!entries.length) {
      var empty = document.createElement("p");
      empty.className = "ch-hint";
      empty.textContent = "这次不是闹钟打开的，没有临时覆盖。";
      box.appendChild(empty);
      return;
    }
    var tip = document.createElement("p");
    tip.className = "ch-hint";
    tip.textContent = "仅本次生效，不会写进插件设置。";
    box.appendChild(tip);
    entries.forEach(function (pair) {
      var row = document.createElement("div");
      row.className = "ch-override-row";
      var k = document.createElement("span");
      k.className = "ch-override-k";
      k.textContent = pair[0];
      var v = document.createElement("span");
      v.className = "ch-override-v";
      v.textContent = String(pair[1]);
      row.appendChild(k);
      row.appendChild(v);
      box.appendChild(row);
    });
  }

  function wireLaunchParamsApi() {
    window.callai.getLaunchParams = function () {
      return mergeLaunchParams();
    };
    // raw alarm layer only — plugins should use this for "override" UI
    window.callai.getAlarmLaunchParams = function () {
      return Object.assign({}, alarmLaunchOnly());
    };
    window.callai.getHostParams = function () {
      return Object.assign({}, hostParams);
    };
    window.addEventListener("message", function (ev) {
      var d = ev.data || {};
      if (d && d.__callai_set_launch_params) {
        // bridge already set launchParams; refresh badge + notify with split detail
        try {
          window.dispatchEvent(
            new CustomEvent("callai:launch-params", {
              detail: {
                alarm: alarmLaunchOnly(),
                host: Object.assign({}, hostParams),
                effective: mergeLaunchParams(),
              },
            }),
          );
        } catch (e) {}
        syncOverrideBadge();
        renderOverridePanel();
      }
    });
  }

  function wireNotifications() {
    var orig = window.callai.notification && window.callai.notification.show;
    if (!orig) return;
    window.callai.notification.show = function (a, b) {
      if (!prefs.notifications) {
        return Promise.resolve({ queued: false, suppressed: true });
      }
      return orig.call(window.callai.notification, a, b);
    };
  }

  function savePrefs() {
    if (!window.callai || !window.callai.storage) return Promise.resolve();
    return window.callai.storage.set(PREFS_KEY, prefs);
  }
  function saveParams() {
    if (!window.callai || !window.callai.storage) return Promise.resolve();
    // settings ≡ params: write the same business key object plugins use.
    return window.callai.storage
      .set("settings", hostParams)
      .then(function () {
        return window.callai.storage.set(PARAMS_KEY, hostParams);
      })
      .then(function () {
        try {
          window.dispatchEvent(
            new CustomEvent("callai:launch-params", {
              detail: {
                alarm: alarmLaunchOnly(),
                host: Object.assign({}, hostParams),
                effective: mergeLaunchParams(),
              },
            }),
          );
          syncOverrideBadge();
          renderOverridePanel();
        } catch (e) {}
      });
  }
  function savePanel() {
    if (!window.callai || !window.callai.storage) return Promise.resolve();
    return window.callai.storage.set(PANEL_KEY, panelPos || {});
  }


  function viewport() {
    return {
      vw: window.innerWidth || 360,
      vh: window.innerHeight || 640,
    };
  }

  function barSize() {
    var bar = $("callai-host-bar");
    if (!bar) return { w: BAR_W_FALLBACK, h: BAR_H };
    var r = bar.getBoundingClientRect();
    return {
      w: Math.max(40, Math.round(r.width) || BAR_W_FALLBACK),
      h: Math.max(40, Math.round(r.height) || BAR_H),
    };
  }

  /** Vertical only when docked to left/right mid-edge (no top/bottom snap). */
  function isVerticalDock(pos) {
    return !!(pos && pos.snapX && !pos.snapY);
  }

  function applyOrientation() {
    var bar = $("callai-host-bar");
    if (!bar) return;
    var vertical =
      dragOrient != null
        ? dragOrient === "vertical"
        : isVerticalDock(panelPos);
    bar.classList.toggle("is-vertical", vertical);
  }

  function writeFracs(pos, s, vw, vh) {
    var freeW = Math.max(1, vw - s.w - 2 * MARGIN);
    var freeH = Math.max(1, vh - s.h - 2 * MARGIN);
    pos.xFrac = (pos.x - MARGIN) / freeW;
    pos.yFrac = (pos.y - MARGIN) / freeH;
    if (pos.xFrac < 0) pos.xFrac = 0;
    if (pos.xFrac > 1) pos.xFrac = 1;
    if (pos.yFrac < 0) pos.yFrac = 0;
    if (pos.yFrac > 1) pos.yFrac = 1;
    return pos;
  }

  function defaultPos() {
    var v = viewport();
    applyOrientation();
    var s = barSize();
    return writeFracs(
      {
        x: v.vw - s.w - MARGIN,
        y: v.vh - s.h - MARGIN - 8,
        snapX: "right",
        snapY: "bottom",
      },
      s,
      v.vw,
      v.vh,
    );
  }

  /**
   * Resolve pixel position from anchors (snapX/snapY) + free-axis fractions.
   * Keeps edge docking stable across window resizes.
   */
  function resolvePos() {
    var v = viewport();
    applyOrientation();
    var s = barSize();
    var pos = panelPos;
    if (!pos) pos = defaultPos();

    var x;
    var y;
    if (pos.snapX === "left") x = MARGIN;
    else if (pos.snapX === "right") x = v.vw - s.w - MARGIN;
    else if (pos.xFrac != null && isFinite(pos.xFrac)) {
      x = MARGIN + pos.xFrac * Math.max(0, v.vw - s.w - 2 * MARGIN);
    } else {
      x = pos.x != null ? Number(pos.x) : MARGIN;
    }

    if (pos.snapY === "top") y = MARGIN;
    else if (pos.snapY === "bottom") y = v.vh - s.h - MARGIN;
    else if (pos.yFrac != null && isFinite(pos.yFrac)) {
      y = MARGIN + pos.yFrac * Math.max(0, v.vh - s.h - 2 * MARGIN);
    } else {
      y = pos.y != null ? Number(pos.y) : MARGIN;
    }

    x = Math.max(MARGIN, Math.min(v.vw - s.w - MARGIN, x));
    y = Math.max(MARGIN, Math.min(v.vh - s.h - MARGIN, y));

    var out = {
      x: x,
      y: y,
      snapX: pos.snapX === "left" || pos.snapX === "right" ? pos.snapX : null,
      snapY: pos.snapY === "top" || pos.snapY === "bottom" ? pos.snapY : null,
      xFrac: pos.xFrac,
      yFrac: pos.yFrac,
    };
    return writeFracs(out, s, v.vw, v.vh);
  }

  function clampPos(x, y) {
    var v = viewport();
    var s = barSize();
    x = Math.max(MARGIN, Math.min(v.vw - s.w - MARGIN, x));
    y = Math.max(MARGIN, Math.min(v.vh - s.h - MARGIN, y));
    return { x: x, y: y, snapX: null, snapY: null };
  }

  /** After drag: dock to nearest edges and set orientation. */
  function snapPos(x, y) {
    var v = viewport();
    // Measure with current orientation, then re-resolve after dock orientation changes.
    var s = barSize();
    var toL = x;
    var toR = v.vw - (x + s.w);
    var toT = y;
    var toB = v.vh - (y + s.h);

    var snapX = null;
    var snapY = null;
    if (toL <= SNAP) snapX = "left";
    else if (toR <= SNAP) snapX = "right";
    if (toT <= SNAP) snapY = "top";
    else if (toB <= SNAP) snapY = "bottom";

    // If near a side but not a corner, prefer single-axis dock (enables vertical bar).
    var sideOnly = Math.min(toL, toR);
    var topBotOnly = Math.min(toT, toB);
    if (sideOnly <= SNAP * 2 && sideOnly + 8 < topBotOnly) {
      snapY = null;
      if (toL <= toR) snapX = "left";
      else snapX = "right";
    } else if (topBotOnly <= SNAP * 2 && topBotOnly + 8 < sideOnly) {
      snapX = null;
      if (toT <= toB) snapY = "top";
      else snapY = "bottom";
    }

    panelPos = {
      x: x,
      y: y,
      snapX: snapX,
      snapY: snapY,
      xFrac: null,
      yFrac: null,
    };
    // Orientation may change size (horizontal ↔ vertical); resolve twice.
    applyOrientation();
    panelPos = resolvePos();
    applyOrientation();
    panelPos = resolvePos();
    return panelPos;
  }

  function placeBar() {
    var bar = $("callai-host-bar");
    if (!bar) return;
    applyOrientation();
    var pos = resolvePos();
    // If orientation flipped size, resolve again with true bar metrics.
    applyOrientation();
    pos = resolvePos();
    panelPos = pos;
    bar.style.left = pos.x + "px";
    bar.style.top = pos.y + "px";
    bar.style.right = "auto";
    bar.style.bottom = "auto";
  }

  function syncBarButtons() {
    var themeBtn = $("ch-bar-theme");
    var notifyBtn = $("ch-bar-notify");
    if (themeBtn) {
      themeBtn.classList.toggle("is-on", prefs.theme === "dark");
      themeBtn.title = prefs.theme === "dark" ? "深色（点击切换浅色）" : "浅色（点击切换深色）";
      themeBtn.setAttribute("aria-pressed", prefs.theme === "dark" ? "true" : "false");
    }
    if (notifyBtn) {
      notifyBtn.classList.toggle("is-on", !!prefs.notifications);
      notifyBtn.title = prefs.notifications ? "通知开（点击关闭）" : "通知关（点击打开）";
      notifyBtn.setAttribute("aria-pressed", prefs.notifications ? "true" : "false");
    }
  }

  function openModal(tab) {
    var bd = $("callai-host-modal-backdrop");
    if (bd) bd.classList.add("is-open");
    renderParamsEditor();
    renderOverridePanel();
    syncOverrideBadge();
    syncThemeSeg();
    syncNotifyBtn();
    syncBarButtons();
    if (tab) setTab(tab);
  }
  function closeModal() {
    var bd = $("callai-host-modal-backdrop");
    if (bd) bd.classList.remove("is-open");
  }

  function setTab(name) {
    ["params", "theme", "notify"].forEach(function (t) {
      var btn = $("ch-tab-" + t);
      var panel = $("ch-panel-" + t);
      var on = t === name;
      if (btn) {
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      }
      if (panel) panel.classList.toggle("on", on);
    });
  }

  function syncThemeSeg() {
    var light = $("ch-theme-light");
    var dark = $("ch-theme-dark");
    if (light) light.classList.toggle("on", prefs.theme !== "dark");
    if (dark) dark.classList.toggle("on", prefs.theme === "dark");
  }
  function syncNotifyBtn() {
    var btn = $("ch-notify-toggle");
    if (!btn) return;
    var on = !!prefs.notifications;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
    btn.title = on ? "通知开" : "通知关";
  }

  function renderParamsEditor() {
    var box = $("ch-params-list");
    if (!box) return;
    box.innerHTML = "";
    var keys = Object.keys(hostParams || {});
    if (!keys.length) {
      var empty = document.createElement("div");
      empty.className = "ch-hint";
      empty.textContent = "还没有参数，点下面加一个吧。";
      box.appendChild(empty);
    }
    keys.forEach(function (k) {
      var row = document.createElement("div");
      row.className = "ch-kv";
      var ik = document.createElement("input");
      ik.className = "ch-input";
      ik.placeholder = "key";
      ik.value = k;
      var iv = document.createElement("input");
      iv.className = "ch-input";
      iv.placeholder = "value";
      iv.value = hostParams[k] == null ? "" : String(hostParams[k]);
      var del = document.createElement("button");
      del.className = "ch-btn ghost ch-btn-icon";
      del.type = "button";
      del.setAttribute("aria-label", "删除");
      del.textContent = "×";
      function commit() {
        var nk = ik.value.trim();
        var nv = iv.value;
        delete hostParams[k];
        if (nk) hostParams[nk] = nv;
        saveParams();
        renderParamsEditor();
      }
      ik.addEventListener("change", commit);
      iv.addEventListener("change", commit);
      del.addEventListener("click", function () {
        delete hostParams[k];
        saveParams();
        renderParamsEditor();
      });
      row.appendChild(ik);
      row.appendChild(iv);
      row.appendChild(del);
      box.appendChild(row);
    });
  }


  function buildDom() {
    if ($("callai-host-root")) return;
    var root = document.createElement("div");
    root.id = "callai-host-root";
    root.setAttribute("data-callai-no-invert", "1");
    root.innerHTML =
      '<div id="callai-host-bar" role="toolbar" aria-label="插件主机工具条">' +
      '<button type="button" class="ch-bar-handle" id="ch-bar-handle" title="拖动" aria-label="拖动工具条">' +
      '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
      '<circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/>' +
      '<circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>' +
      '<circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/>' +
      "</svg></button>" +
      '<span class="ch-bar-sep" aria-hidden="true"></span>' +
      '<button type="button" class="ch-bar-btn" id="ch-bar-params" title="设置" aria-label="打开插件设置">' +
      '<svg class="callai-host-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M4 12h2.2M17.8 12H20M12 4v2.2M12 17.8V20M6.4 6.4l1.6 1.6M16 16l1.6 1.6M17.6 6.4 16 8M8 16l-1.6 1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg></button>" +
      '<button type="button" class="ch-bar-btn" id="ch-bar-theme" title="主题" aria-label="切换主题">' +
      '<svg class="callai-host-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 3a9 9 0 1 0 9 9c0-4-3-7-7-8a5.5 5.5 0 0 1-2 8 5.5 5.5 0 0 1 0-9z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      "</svg></button>" +
      '<button type="button" class="ch-bar-btn" id="ch-bar-notify" title="通知" aria-label="切换通知">' +
      '<svg class="callai-host-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M6 17h12l-1.2-2.2V11a4.8 4.8 0 1 0-9.6 0v3.8L6 17z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg></button>" +
      '<button type="button" class="ch-bar-btn ch-bar-override" id="ch-bar-override" title="本次闹钟参数" aria-label="查看本次闹钟参数" hidden>' +
      '<svg class="callai-host-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/>' +
      "</svg></button>" +
      "</div>" +
      '<svg id="callai-host-modal-clip-svg" style="position:absolute;width:0;height:0" aria-hidden="true" focusable="false">' +
      "<defs>" +
      '<clipPath id="animal-modal-clip" clipPathUnits="objectBoundingBox">' +
      '<path d="M0.501,0.005 L0.501,0.005 L0.523,0.005 L0.549,0.006 C0.704,0.01,0.796,0.017,0.825,0.027 L0.827,0.028 C0.872,0.045,0.939,0.044,0.978,0.17 C1,0.254,1,0.365,0.99,0.505 L0.988,0.513 C0.979,0.558,0.971,0.598,0.965,0.633 C0.956,0.689,0.979,0.77,0.964,0.865 C0.953,0.928,0.921,0.966,0.869,0.979 C0.821,0.986,0.773,0.992,0.726,0.995 L0.712,0.996 L0.694,0.997 C0.648,1,0.586,1,0.507,1 L0.501,1 L0.464,1 C0.385,1,0.325,0.998,0.283,0.995 C0.234,0.992,0.184,0.987,0.133,0.979 C0.081,0.966,0.05,0.928,0.039,0.865 C0.023,0.77,0.047,0.689,0.037,0.633 C0.031,0.595,0.023,0.552,0.013,0.505 C-0.006,0.365,-0.002,0.254,0.024,0.17 C0.064,0.045,0.13,0.045,0.174,0.028 L0.175,0.028 C0.204,0.017,0.303,0.009,0.474,0.005 L0.501,0.005"/>' +
      "</clipPath></defs></svg>" +
      '<div id="callai-host-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ch-modal-title">' +
      '<div id="callai-host-modal" class="ch-modal-shell">' +
      '<div class="ch-modal-plate">' +
      '<div class="ch-modal-header">' +
      '<h2 id="ch-modal-title" class="ch-modal-title">小设置</h2>' +
      '<button type="button" class="ch-modal-x" id="ch-modal-x" title="关闭" aria-label="关闭">×</button>' +
      "</div>" +
      '<p class="ch-meta">拖动手柄挪位置。在这里改参数、外观和通知。</p>' +
      '<div class="ch-tabs-card">' +
      '<div id="callai-host-tabs" class="ch-tabs" role="tablist">' +
      '<button type="button" role="tab" id="ch-tab-params" class="on" aria-selected="true">参数</button>' +
      '<button type="button" role="tab" id="ch-tab-theme" aria-selected="false">主题</button>' +
      '<button type="button" role="tab" id="ch-tab-notify" aria-selected="false">通知</button>' +
      "</div>" +
      '<div class="ch-modal-body">' +
      '<div id="ch-panel-params" class="ch-panel on" role="tabpanel">' +
      '<p class="ch-hint">这里保存的是插件自己的参数。</p>' +
      '<div id="ch-override-block" class="ch-override-block">' +
      '<div class="ch-label">本次闹钟</div>' +
      '<div id="ch-override-list"></div>' +
      "</div>" +
      '<div id="ch-params-list"></div>' +
      '<div class="ch-actions ch-actions-inline">' +
      '<button type="button" class="ch-btn" id="ch-param-add">加一个</button>' +
      "</div></div>" +
      '<div id="ch-panel-theme" class="ch-panel" role="tabpanel">' +
      '<div class="ch-row"><span class="ch-label">外观</span>' +
      '<div class="ch-seg" role="group" aria-label="外观">' +
      '<button type="button" id="ch-theme-light" class="on">浅色</button>' +
      '<button type="button" id="ch-theme-dark">深色</button></div></div>' +
      '<p class="ch-hint">选一个舒服的外观就好。</p>' +
      "</div>" +
      '<div id="ch-panel-notify" class="ch-panel" role="tabpanel">' +
      '<div class="ch-row"><span class="ch-label">允许通知</span>' +
      '<button type="button" class="ch-switch" id="ch-notify-toggle" role="switch" aria-checked="true" title="通知开关">' +
      '<span class="ch-switch-track" aria-hidden="true"><span class="ch-switch-handle"></span></span>' +
      "</button></div>" +
      '<p class="ch-hint">关掉后，这个插件不会再打扰你。</p>' +
      "</div></div></div>" +
      '<div class="ch-modal-footer">' +
      '<button type="button" class="ch-btn primary" id="ch-close">完成</button>' +
      "</div>" +
      "</div></div></div>";
    document.documentElement.appendChild(root);

    $("ch-tab-params").onclick = function () { setTab("params"); };
    $("ch-tab-theme").onclick = function () { setTab("theme"); };
    $("ch-tab-notify").onclick = function () { setTab("notify"); };
    $("ch-close").onclick = closeModal;
    $("ch-modal-x").onclick = closeModal;
    $("callai-host-modal-backdrop").addEventListener("click", function (e) {
      if (e.target === $("callai-host-modal-backdrop")) closeModal();
    });
    function setTheme(next) {
      prefs.theme = next;
      applyTheme();
      syncThemeSeg();
      syncBarButtons();
      savePrefs();
    }
    $("ch-theme-light").onclick = function () { setTheme("light"); };
    $("ch-theme-dark").onclick = function () { setTheme("dark"); };
    function toggleNotify() {
      prefs.notifications = !prefs.notifications;
      syncNotifyBtn();
      syncBarButtons();
      savePrefs();
    }
    $("ch-notify-toggle").onclick = toggleNotify;
    $("ch-param-add").onclick = function () {
      var n = 1;
      var key = "key" + n;
      while (Object.prototype.hasOwnProperty.call(hostParams, key)) {
        n += 1;
        key = "key" + n;
      }
      hostParams[key] = "";
      saveParams();
      renderParamsEditor();
    };

    $("ch-bar-params").onclick = function (e) {
      e.stopPropagation();
      openModal();
      setTab("params");
    };
    var ovBtn = $("ch-bar-override");
    if (ovBtn) {
      ovBtn.onclick = function (e) {
        e.stopPropagation();
        openModal();
        setTab("params");
        renderOverridePanel();
      };
    }
    $("ch-bar-theme").onclick = function (e) {
      e.stopPropagation();
      setTheme(prefs.theme === "dark" ? "light" : "dark");
    };
    $("ch-bar-notify").onclick = function (e) {
      e.stopPropagation();
      toggleNotify();
    };

    var bar = $("callai-host-bar");
    var handle = $("ch-bar-handle");
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dragging = true;
      moved = false;
      dragOrient = isVerticalDock(panelPos) ? "vertical" : "horizontal";
      bar.classList.add("is-dragging");
      handle.setPointerCapture(e.pointerId);
      var rect = bar.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      moved = true;
      var x = e.clientX - dragOffset.x;
      var y = e.clientY - dragOffset.y;
      // Free drag — keep current orientation until release snap.
      var free = clampPos(x, y);
      panelPos = {
        x: free.x,
        y: free.y,
        snapX: null,
        snapY: null,
        xFrac: null,
        yFrac: null,
      };
      placeBar();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("is-dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      if (panelPos) {
        panelPos = snapPos(panelPos.x, panelPos.y);
        dragOrient = null;
        placeBar();
        savePanel();
      } else {
        dragOrient = null;
      }
    }
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", function () {
      // Keep snap/frac anchors — never re-pick nearest edge (avoids jump to center).
      placeBar();
    });
    syncBarButtons();
  }

  function boot() {
    if (!window.callai || !window.callai.ready) {
      setTimeout(boot, 40);
      return;
    }
    wireLaunchParamsApi();
    wireNotifications();
    buildDom();
    Promise.all([
      window.callai.storage.get(PREFS_KEY),
      window.callai.storage.get("settings"),
      window.callai.storage.get(PANEL_KEY),
      window.callai.storage.get(PARAMS_KEY),
    ])
      .then(function (arr) {
        prefs = Object.assign({}, defaults, arr[0] || {});
        // Prefer plugin settings object (canonical); fall back to host mirror.
        var fromSettings = arr[1];
        var fromMirror = arr[3];
        if (fromSettings && typeof fromSettings === "object" && !Array.isArray(fromSettings)) {
          hostParams = fromSettings;
        } else if (fromMirror && typeof fromMirror === "object" && !Array.isArray(fromMirror)) {
          hostParams = fromMirror;
        } else {
          hostParams = {};
        }
        if (arr[2] && typeof arr[2] === "object") {
          var raw = arr[2];
          panelPos = {
            x: raw.x != null ? Number(raw.x) : null,
            y: raw.y != null ? Number(raw.y) : null,
            xFrac: raw.xFrac != null ? Number(raw.xFrac) : null,
            yFrac: raw.yFrac != null ? Number(raw.yFrac) : null,
            snapX:
              raw.snapX === "left" || raw.snapX === "right" ? raw.snapX : null,
            snapY:
              raw.snapY === "top" || raw.snapY === "bottom" ? raw.snapY : null,
          };
          // Legacy only {x,y}: recover snaps from proximity once.
          if (panelPos.x != null && panelPos.y != null && !panelPos.snapX && !panelPos.snapY && panelPos.xFrac == null) {
            panelPos = snapPos(panelPos.x, panelPos.y);
          }
        } else {
          panelPos = null;
        }
        applyTheme();
        placeBar();
        // notify plugin that host params layer is ready
        try {
          window.dispatchEvent(
            new CustomEvent("callai:launch-params", {
              detail: {
                alarm: alarmLaunchOnly(),
                host: Object.assign({}, hostParams),
                effective: mergeLaunchParams(),
              },
            }),
          );
          syncOverrideBadge();
          renderOverridePanel();
        } catch (e) {}
      })
      .catch(function () {
        applyTheme();
        placeBar();
      });

    window.callai.openHostSettings = openModal;
    window.callai.getHostPrefs = function () {
      return Object.assign({}, prefs);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>
