// ==UserScript==
// @name         AO3
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  This script adds fandom search in the history tab.
// @author       Nichole Zacherl
// @match        https://archiveofourown.org/*
// @grant        none
// ==/UserScript==

/* global jQuery */
(function () {
  "use strict";
  if (!jQuery) {
    console.log("jQuery not found");
    return;
  }

  if (inIframe()) {
    return;
  }

  const $ = jQuery;
  window.$ = $;
  const tagDelay = 1000 * 60 * 60 * 5;
  let workId = 0;
  if (location.pathname.startsWith("/works")) {
    workId = location.pathname.split("/")[2];
  }
  console.log("workId: " + workId);

  // Element Accessors
  const getSidebar = () => $("#cg-right-sidebar");
  const getStyle = () => $("#cg-styles");

  // Styles
  var styles = getStyle();
  styles.remove();
  $("head").append(`
<style>
    #cg-data-frame {
        display: none;
        position: absolute;
        opacity: 0;
    }

    #cg-right-sidebar {
        max-width: 350px;
        padding: 8px;
    }

    .cg-flex-container {
        display: flex;
    }

    .cg-flex-item {
        flex: 1;
    }

    .cg-fandom-name {

    }

    .cg-tag-container {
        padding: 0 0 8px 12px;
    }
</style>
`);

  // Utility Functions
  function rewireDeleteButtons() {
    jQuery('ul.actions [data-method="delete"]').off("click");

    jQuery('ul.actions [data-method="delete"]').on("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = $(e.target);
      const bookmark = target.closest(".bookmark");
      const bookmarkId = target.attr("href").split("bookmarks/")[1];
      console.log("test", bookmarkId);

      var newForm = jQuery('<form id="delete-form" style="display: none">', {
        action: "https://archiveofourown.org/bookmarks/307144424",
        target: "_blank",
        method: "post",
      })
        .append(
          jQuery("<input>", {
            name: "_method",
            value: "delete",
            type: "hidden",
          })
        )
        .append(
          jQuery("<input>", {
            name: "authenticity_token",
            value: jQuery('meta[name="csrf-token"').attr("content"),
            type: "hidden",
          })
        );
      jQuery("body").append(newForm);

      bookmark.append(
        '<div style="display: flex; align-items: center; justify-content: center; position: absolute; top:0; left: 0; width: 100%; height: 100%; z-index: 999; background: rgba(0, 0, 0, .4)"><div style="padding: 10px; background: #FFF">Deleting...</div></div>'
      );
      $.post(
        `https://archiveofourown.org/bookmarks/${bookmarkId}`,
        $("#delete-form").serialize()
      )
        .done(function () {
          bookmark.fadeOut({ done: () => bookmark.remove() });
        })
        .fail(function (e) {
          alert("Failed to delete bookmark: " + e);
        });
    });
  }

  function inIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  function loadPageFrame(page, retries = 0) {
    return new Promise((resolve) => {
      const delay = retries && Math.pow(2, retries) * 100;
      if (delay) console.log(`Backoff timer ${delay}`);
      setTimeout(() => {
        const frame = $(
          `<iframe id="cg-data-frame" src="https://archiveofourown.org/users/DevilsPetVolpe/readings?show=to-read&page=${page}"></iframe>`
        );
        frame.on("load", () => {
          const isLoaded = () => frame[0]?.contentWindow?.jQuery;
          if (isLoaded()) resolve(frame);
          else {
            let count = 0;
            const max = 10;
            const timer = setInterval(() => {
              console.log("waiting for load");
              if (isLoaded()) {
                clearInterval(timer);
                resolve(frame);
              } else if (count < max) {
                count++;
              } else {
                clearInterval(timer);
                frame.remove();
                loadPageFrame(page, retries + 1).then((frame) =>
                  resolve(frame)
                );
              }
            }, 200);
          }
        });
        $("body").append(frame);
      }, delay);
    });
  }

  function loadTags(workElements, current, tagObj) {
    const { tags, ftags, works } = tagObj;
    return new Promise((resolve) => {
      if (current < workElements.length) {
        const w = workElements[current];
        const workId = w.attr("id");
        if (workId) {
          const link = w.find(".heading a:first-child");
          const href = link.attr("href");
          const work = {
            name: link.text(),
            id: workId.replace("work_", ""),
            href,
          };

          w.find("ul.tags .tag")
            .toArray()
            .map((t) => $(t).text())
            .forEach((t) => {
              if (!tags[t]) tags[t] = [];
              tags[t].push(work.id);
            });

          w.find(".fandoms .tag")
            .toArray()
            .map((t) => $(t).text())
            .forEach((t) => {
              if (!ftags[t]) ftags[t] = [];
              ftags[t].push(work.id);
            });
          works[work.id] = work;
          loadTags(workElements, current + 1, tagObj).then(() => resolve());
        } else if (w.hasClass("deleted")) {
          deleteWork(w).then(() => resolve());
        } else {
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  function loadTagsForPage(page, tagObj) {
    console.log(`Getting tags for page ${page}`);
    return loadPageFrame(page).then((frame) => {
      const work = frame[0].contentWindow
        .jQuery("li.work")
        .toArray()
        .map((w) => $(w));
      return loadTags(work, 0, tagObj).then(() => {
        frame.remove();
      });
    });
  }

  function getPageCount() {
    return loadPageFrame(1).then((frame) => {
      const pageCount = parseInt(
        frame[0].contentWindow.jQuery("ol.pagination .next").prev().text()
      );
      console.log(`Page Count ${pageCount}`);
      return pageCount;
    });
  }

  function deleteWork(work) {
    return new Promise((resolve) => {
      debugger;
      const bookmarkId = work.find("#reading").val();
      console.log("Deleting History", bookmarkId);
      const url = `https://archiveofourown.org/users/DevilsPetVolpe/readings/${bookmarkId}`;
      var newForm = jQuery('<form id="delete-form" style="display: none">', {
        action: url,
        target: "_blank",
        method: "post",
      })
        .append(
          jQuery("<input>", {
            name: "_method",
            value: "delete",
            type: "hidden",
          })
        )
        .append(
          jQuery("<input>", {
            name: "authenticity_token",
            value: jQuery('meta[name="csrf-token"').attr("content"),
            type: "hidden",
          })
        );
      jQuery("body").append(newForm);
      $.post(url, $("#delete-form").serialize())
        .done(function () {
          console.log(`Deleted history ${bookmarkId}`);
          resolve();
        })
        .fail(function (e) {
          alert("Failed to delete bookmark: " + e);
          resolve();
        });
    });
  }

  function computeTags(current, tagObj = { works: {}, ftags: {}, tags: {} }) {
    return new Promise((resolve) => {
      if (current === undefined) {
        getPageCount().then((pageCount) => {
          computeTags(pageCount, tagObj).then(() => resolve(tagObj));
        });
      } else if (current > 0) {
        loadTagsForPage(current, tagObj).then((frame) => {
          computeTags(current - 1, tagObj).then(() => resolve());
        });
      } else {
        console.log("Finished loading tags");
        tagObj.timestamp = Date.now();
        localStorage.setItem("marked-for-later", JSON.stringify(tagObj));
        resolve();
      }
    });
  }

  function addSidebar() {
    if (getSidebar().length == 0) {
      var main = $("#main");
      var children = main.children().toArray();
      var wrapper = $(
        '<div id="cg-main-wrapper" class="cg-flex-container"></div>'
      );
      var content = $('<div class="cg-flex-item"></div>');
      var rightSidebar = $('<div id="cg-right-sidebar"></div>');
      children.forEach((c) => content.append(c));
      wrapper.append(content);
      wrapper.append(rightSidebar);
      main.append(wrapper);
    }
  }

  function loadCache() {
    const json = localStorage.getItem("marked-for-later");
    return JSON.parse(json);
  }

  const alphaSort = (a, b) => (a < b ? -1 : 1);

  function buildSidebar({ works, ftags, tags }) {
    const sidebar = getSidebar();
    sidebar.empty();
    Object.entries(ftags)
      .sort(alphaSort)
      .forEach(([fandom, workIds]) =>
        sidebar.append(`
<div>
    <div class="cg-fandom-name">${fandom}</div>
    <div class="cg-tag-container">
        ${workIds
          .map((id) => works[id])
          .sort((a, b) => alphaSort(a.name, b.name))
          .map(
            ({ id, name, href }) => `
                <li><a href="${href}">${name}</a></li>
            `
          )
          .join("")}
</div>
</div>`)
      );
  }

  function recomputeTags(delay) {
    debugger;
    console.log(`recomputing in ${delay} ms`);
    setTimeout(() => {
      computeTags().then((tagObj) => {
        console.log(tagObj);
        buildSidebar(tagObj);
        recomputeTags(tagDelay);
      });
    }, delay);
  }

  var params = new URLSearchParams(window.location.search);
  switch (location.pathname) {
    case "/users/DevilsPetVolpe/readings": {
      if (params.get("show")) {
        addSidebar();
        const cached = loadCache();
        var timestamp = cached?.timestamp
          ? tagDelay - (Date.now() - cached.timestamp)
          : 0;
        if (cached) {
          buildSidebar(cached);
        }

        recomputeTags(timestamp);
      }
      break;
    }
  }

  if (location.pathname.startsWith("/users/DevilsPetVolpe/bookmarks")) {
    rewireDeleteButtons();
  }
})();
