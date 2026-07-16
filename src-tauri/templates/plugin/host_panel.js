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
  var panelPos = null; // {x,y} or null → default bottom-right
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

  function mergeLaunchParams() {
    // effective launch = host params (plugin settings sheet) then alarm overrides
    var alarm = window.callai.launchParams || {};
    return Object.assign({}, hostParams, alarm);
  }

  function wireLaunchParamsApi() {
    var prevGet = window.callai.getLaunchParams;
    window.callai.getLaunchParams = function () {
      return mergeLaunchParams();
    };
    // keep raw alarm params accessible
    window.callai.getAlarmLaunchParams = function () {
      return window.callai.launchParams || {};
    };
    window.callai.getHostParams = function () {
      return Object.assign({}, hostParams);
    };
    // re-fire when either layer changes
    var origReady = window.callai.ready;
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
              detail: mergeLaunchParams(),
            }),
          );
        } catch (e) {}
      });
  }
  function savePanel() {
    if (!window.callai || !window.callai.storage) return Promise.resolve();
    return window.callai.storage.set(PANEL_KEY, panelPos || {});
  }


  function barSize() {
    var bar = $("callai-host-bar");
    if (!bar) return { w: BAR_W_FALLBACK, h: BAR_H };
    var r = bar.getBoundingClientRect();
    return {
      w: Math.max(80, Math.round(r.width) || BAR_W_FALLBACK),
      h: Math.max(40, Math.round(r.height) || BAR_H),
    };
  }

  function clampPos(x, y) {
    var vw = window.innerWidth || 360;
    var vh = window.innerHeight || 640;
    var s = barSize();
    x = Math.max(MARGIN, Math.min(vw - s.w - MARGIN, x));
    y = Math.max(MARGIN, Math.min(vh - s.h - MARGIN, y));
    return { x: x, y: y };
  }

  function snapPos(x, y) {
    var vw = window.innerWidth || 360;
    var vh = window.innerHeight || 640;
    var s = barSize();
    var cx = x + s.w / 2;
    var cy = y + s.h / 2;
    var toL = cx;
    var toR = vw - cx;
    var toT = cy;
    var toB = vh - cy;
    var min = Math.min(toL, toR, toT, toB);
    if (min <= SNAP * 2) {
      if (min === toL) x = MARGIN;
      else if (min === toR) x = vw - s.w - MARGIN;
      if (min === toT) y = MARGIN;
      else if (min === toB) y = vh - s.h - MARGIN;
    }
    if (toL < SNAP) x = MARGIN;
    if (toR < SNAP) x = vw - s.w - MARGIN;
    if (toT < SNAP) y = MARGIN;
    if (toB < SNAP) y = vh - s.h - MARGIN;
    return clampPos(x, y);
  }

  function placeBar() {
    var bar = $("callai-host-bar");
    if (!bar) return;
    var pos = panelPos;
    var s = barSize();
    if (!pos || pos.x == null || pos.y == null) {
      var vw = window.innerWidth || 360;
      var vh = window.innerHeight || 640;
      pos = { x: vw - s.w - MARGIN, y: vh - s.h - MARGIN - 8 };
    }
    pos = clampPos(pos.x, pos.y);
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
      if (btn) btn.classList.toggle("on", t === name);
      if (panel) panel.classList.toggle("on", t === name);
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
    btn.textContent = prefs.notifications ? "开" : "关";
    btn.classList.toggle("primary", !!prefs.notifications);
  }

  function renderParamsEditor() {
    var box = $("ch-params-list");
    if (!box) return;
    box.innerHTML = "";
    var keys = Object.keys(hostParams || {});
    if (!keys.length) {
      var empty = document.createElement("div");
      empty.className = "ch-hint";
      empty.textContent = "暂无参数。此处编辑插件 storage 的 settings（与闹钟同名覆盖同一套 key）。";
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
      del.className = "ch-btn ghost";
      del.type = "button";
      del.textContent = "删";
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
      "</div>" +
      '<div id="callai-host-modal-backdrop" role="dialog" aria-modal="true">' +
      '<div id="callai-host-modal">' +
      "<h2>插件控制台</h2>" +
      '<p class="ch-meta">拖动手柄移动；主题/通知一键切换；设置打开完整控制台。</p>' +
      '<div id="callai-host-tabs">' +
      '<button type="button" id="ch-tab-params" class="on">参数</button>' +
      '<button type="button" id="ch-tab-theme">主题</button>' +
      '<button type="button" id="ch-tab-notify">通知</button>' +
      "</div>" +
      '<div id="ch-panel-params" class="ch-panel on">' +
      '<p class="ch-hint">直接读写 storage.settings；闹钟 ENV/params 同名覆盖优先于已存值。</p>' +
      '<div id="ch-params-list"></div>' +
      '<div class="ch-actions"><button type="button" class="ch-btn" id="ch-param-add">+ 参数</button></div>' +
      "</div>" +
      '<div id="ch-panel-theme" class="ch-panel">' +
      '<div class="ch-row"><span class="ch-label">外观</span>' +
      '<div class="ch-seg"><button type="button" id="ch-theme-light" class="on">浅色</button>' +
      '<button type="button" id="ch-theme-dark">深色</button></div></div>' +
      '<p class="ch-hint">深色使用 invert + hue-rotate，图片/视频自动二次反色以保持可读。</p>' +
      "</div>" +
      '<div id="ch-panel-notify" class="ch-panel">' +
      '<div class="ch-row"><span class="ch-label">允许通知</span>' +
      '<button type="button" class="ch-btn primary" id="ch-notify-toggle">开</button></div>' +
      '<p class="ch-hint">关闭后本插件 callai.notification.show 将被静默。</p>' +
      "</div>" +
      '<div class="ch-actions"><button type="button" class="ch-btn primary" id="ch-close">完成</button></div>' +
      "</div></div>";
    document.documentElement.appendChild(root);

    $("ch-tab-params").onclick = function () { setTab("params"); };
    $("ch-tab-theme").onclick = function () { setTab("theme"); };
    $("ch-tab-notify").onclick = function () { setTab("notify"); };
    $("ch-close").onclick = closeModal;
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
      panelPos = clampPos(x, y);
      placeBar();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("is-dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      if (panelPos) {
        panelPos = snapPos(panelPos.x, panelPos.y);
        placeBar();
        savePanel();
      }
    }
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", function () {
      if (panelPos) panelPos = snapPos(panelPos.x, panelPos.y);
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
        panelPos =
          arr[2] && typeof arr[2] === "object" && arr[2].x != null
            ? { x: Number(arr[2].x), y: Number(arr[2].y) }
            : null;
        applyTheme();
        placeBar();
        // notify plugin that host params layer is ready
        try {
          window.dispatchEvent(
            new CustomEvent("callai:launch-params", {
              detail: mergeLaunchParams(),
            }),
          );
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
