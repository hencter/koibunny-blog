/* ═══════════════════════════════════════════════════════════════════════════
   main.js — 全部依赖原生 API，无第三方库。
   每一项都是渐进增强：脚本没加载时页面依然完整可读。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 1. 移动端导航 ─────────────────────────────────────────────────────
     先给 <html> 打上 data-nav-ready，CSS 才会把导航收起来；
     这样在没有 JS 的情况下导航保持展开，不会变成打不开的菜单。 */
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");

  if (toggle && nav) {
    document.documentElement.setAttribute("data-nav-ready", "");

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });

    // 视口变宽后复位，避免残留的 is-open 与桌面端规则打架
    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* ── 2. 阅读进度条 ─────────────────────────────────────────────────── */
  var progress = document.querySelector("[data-scroll-progress]");

  if (progress) {
    var updateProgress = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      progress.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
  }

  /* ── 3. 代码块复制按钮 ─────────────────────────────────────────────── */
  Array.prototype.forEach.call(document.querySelectorAll(".prose .highlight"), function (block) {
    var code = block.querySelector("pre");
    if (!code) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.textContent = "复制";

    button.addEventListener("click", function () {
      var text = code.innerText;

      var done = function (ok) {
        button.textContent = ok ? "已复制" : "复制失败";
        button.classList.toggle("is-done", ok);
        window.setTimeout(function () {
          button.textContent = "复制";
          button.classList.remove("is-done");
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(true);
          },
          function () {
            done(false);
          }
        );
      } else {
        // 老浏览器 / 非安全上下文的后备路径
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try {
          ok = document.execCommand("copy");
        } catch (e) {
          ok = false;
        }
        document.body.removeChild(area);
        done(ok);
      }
    });

    block.appendChild(button);
  });

  /* ── 4. 首页终端逐行打字 ───────────────────────────────────────────────
     文本已经由 Hugo 渲染在 HTML 里；这里只是把它重打成动画，
     所以禁用 JS 或减弱动效时内容照样在。 */
  var terminal = document.querySelector("[data-terminal] code");

  if (terminal && !reduceMotion) {
    var lines = Array.prototype.slice.call(terminal.querySelectorAll(".tl"));
    var texts = lines.map(function (line) {
      return line.textContent;
    });

    lines.forEach(function (line) {
      line.textContent = "";
    });

    var lineIndex = 0;

    var typeLine = function () {
      if (lineIndex >= lines.length) {
        terminal.classList.add("is-typed");
        return;
      }

      var line = lines[lineIndex];
      var full = texts[lineIndex];
      // 命令逐个字符打出来，输出行整行出现：更像真实终端
      var isCommand = line.classList.contains("tl-cmd");
      var step = isCommand ? 1 : full.length;
      var pos = 0;

      var tick = function () {
        pos = Math.min(full.length, pos + step);
        line.textContent = full.slice(0, pos);

        if (pos < full.length) {
          window.setTimeout(tick, isCommand ? 34 : 0);
        } else {
          lineIndex += 1;
          window.setTimeout(typeLine, isCommand ? 260 : 90);
        }
      };

      tick();
    };

    window.setTimeout(typeLine, 320);
  }

  /* ── 5. 目录滚动高亮 ───────────────────────────────────────────────── */
  var toc = document.querySelector(".toc");

  if (toc && "IntersectionObserver" in window) {
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var byId = {};

    links.forEach(function (link) {
      var id = decodeURIComponent(link.getAttribute("href").slice(1));
      byId[id] = link;
    });

    var headings = Object.keys(byId)
      .map(function (id) {
        return document.getElementById(id);
      })
      .filter(Boolean);

    if (headings.length) {
      var setCurrent = function (id) {
        links.forEach(function (link) {
          link.classList.remove("is-current");
        });
        if (byId[id]) byId[id].classList.add("is-current");
      };

      var visible = {};

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              visible[entry.target.id] = true;
            } else {
              delete visible[entry.target.id];
            }
          });

          // 取当前可见标题中在文档里最靠前的那个
          for (var i = 0; i < headings.length; i += 1) {
            if (visible[headings[i].id]) {
              setCurrent(headings[i].id);
              return;
            }
          }
        },
        { rootMargin: "-" + (64 + 20) + "px 0px -70% 0px", threshold: 0 }
      );

      headings.forEach(function (heading) {
        observer.observe(heading);
      });
    }
  }

  /* ── 6. 404 页显示真实请求路径 ────────────────────────────────────── */
  var pathSlot = document.querySelector("[data-404-path]");

  if (pathSlot) {
    pathSlot.textContent = window.location.pathname;
  }
})();
