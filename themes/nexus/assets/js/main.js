/* ═══════════════════════════════════════════════════════════════════════════
   main.js — 全部依赖原生 API，无第三方库。
   每一项都是渐进增强：脚本没加载时页面依然完整可读。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

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

  /* ── 2. 文章 / 项目即时搜索 ─────────────────────────────────────────── */
  var search = document.querySelector("[data-site-search]");
  var searchStatus = document.querySelector("[data-search-status]");
  var searchEmpty = document.querySelector("[data-search-empty]");
  var searchCards = Array.prototype.slice.call(document.querySelectorAll("[data-search-card]"));

  if (search) {
    var runSearch = function () {
      var query = search.value.trim().toLocaleLowerCase();
      var visible = 0;

      searchCards.forEach(function (card) {
        var haystack = (card.getAttribute("data-search") || card.innerText).toLocaleLowerCase();
        var match = !query || haystack.indexOf(query) !== -1;
        card.hidden = !match;
        if (match) visible += 1;
      });

      if (searchEmpty) searchEmpty.hidden = !query || visible !== 0;
      if (searchStatus && searchCards.length) {
        searchStatus.textContent = query ? "找到 " + visible + " 条匹配内容" : "已显示全部内容";
      }
    };

    var initialQuery = new URLSearchParams(window.location.search).get("search");
    if (initialQuery) {
      search.value = initialQuery;
      runSearch();
    }

    search.addEventListener("input", runSearch);
    search.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !searchCards.length && search.value.trim()) {
        event.preventDefault();
        var target = search.getAttribute("data-search-url");
        window.location.href = target + "?search=" + encodeURIComponent(search.value.trim());
      }
    });
  }

  /* ── 3. 阅读进度条 ─────────────────────────────────────────────────── */
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

  /* ── 4. 代码块复制按钮 ─────────────────────────────────────────────── */
  Array.prototype.forEach.call(document.querySelectorAll(".prose .highlight"), function (block) {
    var code = block.querySelector("pre");
    if (!code) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn svg-button";
    button.innerHTML = '<svg class="button-frame button-frame-cream" viewBox="0 0 224 64" preserveAspectRatio="none" aria-hidden="true"><path class="button-frame-shadow" d="M14 6H206Q210 6 213 9L216 12Q219 15 219 19V52Q219 55 216 58L214 60Q212 62 209 62H14Q10 62 8 60L6 58Q5 56 5 53V15Q5 12 7 10L10 7Q11 6 14 6Z"/><path class="button-frame-face" d="M12 2H204Q207 2 209 4L213 8Q215 10 215 13V48Q215 51 213 53L209 57Q207 59 204 59H12Q9 59 7 57L3 53Q1 51 1 48V13Q1 10 3 8L7 4Q9 2 12 2Z"/><path class="button-frame-highlight" d="M12 5H203Q206 5 208 7L210 9"/><path class="button-frame-shade" d="M212 15V47Q212 49 210 51L207 54Q205 56 202 56H13"/></svg><span class="button-content"><span class="copy-btn-label">复制</span></span>';
    var label = button.querySelector(".copy-btn-label");

    button.addEventListener("click", function () {
      var text = code.innerText;

      var done = function (ok) {
        label.textContent = ok ? "已复制" : "复制失败";
        button.classList.toggle("is-done", ok);
        window.setTimeout(function () {
          label.textContent = "复制";
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
