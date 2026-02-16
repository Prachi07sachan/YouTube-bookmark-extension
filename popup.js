document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const addButton = document.getElementById("add");
  const bookmarkList = document.getElementById("list");
  const statusText = document.getElementById("status");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettings = document.getElementById("closeSettings");
  const applySettings = document.getElementById("applySettings");
  const deleteAllBtn = document.getElementById("deleteAllBtn");

  // Default settings
  const DEFAULT_SETTINGS = {
    maxBookmarks: 500,
    autoDeletionDays: 0,
    duplicateTolerance: 5,
    theme: "light"
  };

  // Load saved theme
  chrome.storage.sync.get(["theme"], (data) => {
    if (data.theme === "dark") {
      document.body.classList.add("dark");
      themeToggle.checked = true;
    }
  });

  // Toggle theme
  themeToggle.addEventListener("change", () => {
    if (themeToggle.checked) {
      document.body.classList.add("dark");
      chrome.storage.sync.set({ theme: "dark" });
    } else {
      document.body.classList.remove("dark");
      chrome.storage.sync.set({ theme: "light" });
    }
  });

  // Settings Panel Functions
  function loadSettings() {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      document.getElementById("maxBookmarks").value = settings.maxBookmarks;
      document.getElementById("autoDeletionDays").value = settings.autoDeletionDays;
      document.getElementById("duplicateTolerance").value = settings.duplicateTolerance;
    });
  }

  function getSettings(callback) {
    chrome.storage.local.get(DEFAULT_SETTINGS, callback);
  }

  settingsBtn.addEventListener("click", () => {
    loadSettings();
    settingsModal.classList.remove("hidden");
  });

  closeSettings.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add("hidden");
    }
  });

  applySettings.addEventListener("click", () => {
    const newSettings = {
      maxBookmarks: parseInt(document.getElementById("maxBookmarks").value),
      autoDeletionDays: parseInt(document.getElementById("autoDeletionDays").value),
      duplicateTolerance: parseInt(document.getElementById("duplicateTolerance").value)
    };

    chrome.storage.local.set(newSettings, () => {
      showStatus("Settings saved successfully!", "success");
      settingsModal.classList.add("hidden");
      enforceStorageLimit();
    });
  });

  deleteAllBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete ALL bookmarks? This cannot be undone.")) {
      chrome.storage.sync.get(null, (allData) => {
        const keysToDelete = Object.keys(allData).filter(k => k.startsWith("bookmarks_"));
        if (keysToDelete.length > 0) {
          chrome.storage.sync.remove(keysToDelete, () => {
            showStatus("All bookmarks deleted!", "success");
            settingsModal.classList.add("hidden");
            loadAllBookmarks();
          });
        }
      });
    }
  });

  if (!addButton || !bookmarkList) {
    console.error("Required elements not found in popup.html");
    return;
  }

  // Auto-delete old bookmarks based on settings
  function enforceStorageLimit() {
    getSettings((settings) => {
      chrome.storage.sync.get(null, (allData) => {
        const allBookmarks = [];

        for (const [key, bookmarks] of Object.entries(allData)) {
          if (key.startsWith("bookmarks_")) {
            bookmarks.forEach((bookmark, index) => {
              allBookmarks.push({
                ...bookmark,
                storageKey: key,
                bookmarkIndex: index,
                createdAt: bookmark.createdAt || Date.now()
              });
            });
          }
        }

        const now = Date.now();
        const maxAge = settings.autoDeletionDays * 24 * 60 * 60 * 1000;

        // Delete old bookmarks if auto-deletion is enabled
        if (settings.autoDeletionDays > 0) {
          allBookmarks.forEach((bookmark) => {
            if (now - bookmark.createdAt > maxAge) {
              chrome.storage.sync.get([bookmark.storageKey], (data) => {
                const list = data[bookmark.storageKey] || [];
                list.splice(bookmark.bookmarkIndex, 1);
                if (list.length === 0) {
                  chrome.storage.sync.remove(bookmark.storageKey);
                } else {
                  chrome.storage.sync.set({ [bookmark.storageKey]: list });
                }
              });
            }
          });
        }

        // Enforce max bookmark limit
        if (allBookmarks.length > settings.maxBookmarks) {
          const toDelete = allBookmarks.length - settings.maxBookmarks;
          const sorted = allBookmarks.sort((a, b) => a.createdAt - b.createdAt);

          for (let i = 0; i < toDelete; i++) {
            const bookmark = sorted[i];
            chrome.storage.sync.get([bookmark.storageKey], (data) => {
              const list = data[bookmark.storageKey] || [];
              list.splice(bookmark.bookmarkIndex, 1);
              if (list.length === 0) {
                chrome.storage.sync.remove(bookmark.storageKey);
              } else {
                chrome.storage.sync.set({ [bookmark.storageKey]: list });
              }
            });
          }
        }
      });
    });
  }

  // Check for duplicate bookmarks with tolerance
  function checkDuplicate(bookmarks, newTime, tolerance) {
    return bookmarks.some((b) => Math.abs(b.time - newTime) <= tolerance);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function getVideoId(url) {
    const urlObj = new URL(url);
    return (
      urlObj.searchParams.get("v") || url.split("v=")[1]?.split("&")[0] || null
    );
  }

  async function getVideoTitle(tab) {
    return new Promise((resolve) => {
      setTimeout(() => {
        let attempts = 0;
        const maxAttempts = 7;

        function tryGetTitle() {
          chrome.tabs.sendMessage(
            tab.id,
            { action: "GET_TITLE" },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve("Untitled Video");
                return;
              }

              let title = response?.title || "Untitled Video";

              if (
                title &&
                title !== "Untitled Video" &&
                title.trim().length > 3 &&
                !title.includes("undefined") &&
                !title.includes("null")
              ) {
                resolve(title);
              } else {
                attempts++;
                if (attempts < maxAttempts) {
                  setTimeout(tryGetTitle, 600);
                } else {
                  resolve(title || "Untitled Video");
                }
              }
            },
          );
        }

        tryGetTitle();
      }, 1200);
    });
  }

  addButton.onclick = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url.includes("youtube.com")) {
        showStatus("Please open a YouTube video first!", "error");
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { action: "GET_TIME" },
        async (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            showStatus("Could not get video timestamp", "error");
            return;
          }

          const timestamp = Math.floor(response.time);
          const videoId = getVideoId(tab.url);
          const videoTitle = await getVideoTitle(tab);
          const storageKey = `bookmarks_${videoId}`;

          chrome.storage.sync.get([storageKey], (data) => {
            const bookmarks = data[storageKey] || [];

            getSettings((settings) => {
              const tolerance = settings.duplicateTolerance;

              if (checkDuplicate(bookmarks, timestamp, tolerance)) {
                showStatus(
                  `Bookmark exists within ±${tolerance} seconds!`,
                  "warning"
                );
                return;
              }

              bookmarks.push({
                time: timestamp,
                title: formatTime(timestamp),
                videoId,
                videoTitle,
                createdAt: Date.now()
              });

              chrome.storage.sync.set({ [storageKey]: bookmarks }, () => {
                showStatus("Bookmark added!", "success");
                enforceStorageLimit();
                loadAllBookmarks();
              });
            });
          });
        },
      );
    } catch {
      showStatus("Error adding bookmark", "error");
    }
  };

  // Performance optimization: Virtual scrolling for large lists
  let cachedAllBookmarks = [];
  let currentPage = 0;
  const ITEMS_PER_PAGE = 30;

  function loadAllBookmarks() {
    chrome.storage.sync.get(null, (allData) => {
      bookmarkList.innerHTML = "";
      cachedAllBookmarks = [];

      // Batch process bookmarks (performance optimization)
      for (const [key, bookmarks] of Object.entries(allData)) {
        if (key.startsWith("bookmarks_")) {
          bookmarks.forEach((bookmark, index) => {
            cachedAllBookmarks.push({
              ...bookmark,
              storageKey: key,
              bookmarkIndex: index,
            });
          });
        }
      }

      if (cachedAllBookmarks.length === 0) {
        bookmarkList.innerHTML = `
      <li class="empty-state">
      <span class="emoji">🎬</span>
      <div>No timestamps saved yet.</div>
      <div>Start bookmarking!</div>
      </li>
      `;
        return;
      }

      // Sort bookmarks (performance: do this once)
      cachedAllBookmarks.sort(
        (a, b) =>
          (a.videoTitle || "").localeCompare(b.videoTitle || "") ||
          a.time - b.time,
      );

      currentPage = 0;
      renderBookmarksPage();
      renderLoadMoreButton();
    });
  }

  function renderBookmarksPage() {
    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageBookmarks = cachedAllBookmarks.slice(start, end);

    pageBookmarks.forEach((bookmark) => {
      const li = document.createElement("li");
      li.className = "bookmark-item";

      const info = document.createElement("div");
      info.style.flex = "1";
      info.style.display = "flex";
      info.style.flexDirection = "column";

      const title = document.createElement("span");
      title.textContent = bookmark.videoTitle;
      title.style.fontSize = "11px";
      title.style.color = "#666";

      const time = document.createElement("span");
      time.textContent = bookmark.title;
      time.style.color = "#ff0000";
      time.style.cursor = "pointer";

      time.onclick = () => {
        const url = `https://www.youtube.com/watch?v=${bookmark.videoId}&t=${bookmark.time}`;

        chrome.tabs.query({}, (tabs) => {
          const youtubeTab = tabs.find(
            (tab) => tab.url && tab.url.includes("youtube.com"),
          );

          if (youtubeTab) {
            chrome.tabs.update(youtubeTab.id, { url }, () => {
              window.close();
            });
          } else {
            chrome.tabs.create({ url }, () => {
              window.close();
            });
          }
        });
      };

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";

      const trashImg = document.createElement("img");
      trashImg.src = chrome.runtime.getURL("trash.png");
      trashImg.alt = "Delete";
      trashImg.style.width = "16px";
      trashImg.style.height = "16px";

      deleteBtn.appendChild(trashImg);

      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        chrome.storage.sync.get([bookmark.storageKey], (data) => {
          const list = data[bookmark.storageKey] || [];
          list.splice(bookmark.bookmarkIndex, 1);

          if (list.length === 0) {
            chrome.storage.sync.remove(bookmark.storageKey, loadAllBookmarks);
          } else {
            chrome.storage.sync.set(
              { [bookmark.storageKey]: list },
              loadAllBookmarks,
            );
          }
        });
      };

      info.appendChild(title);
      info.appendChild(time);
      li.appendChild(info);
      li.appendChild(deleteBtn);
      bookmarkList.appendChild(li);
    });
  }

  function renderLoadMoreButton() {
    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;

    if (end < cachedAllBookmarks.length) {
      const loadMoreLi = document.createElement("li");
      loadMoreLi.className = "load-more-item";
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.textContent = `Load More (${end}/${cachedAllBookmarks.length})`;
      loadMoreBtn.className = "load-more-btn";

      loadMoreBtn.onclick = () => {
        currentPage++;
        const nextStart = currentPage * ITEMS_PER_PAGE;
        const nextEnd = nextStart + ITEMS_PER_PAGE;
        const nextPageBookmarks = cachedAllBookmarks.slice(nextStart, nextEnd);

        nextPageBookmarks.forEach((bookmark) => {
          const li = document.createElement("li");
          li.className = "bookmark-item";

          const info = document.createElement("div");
          info.style.flex = "1";
          info.style.display = "flex";
          info.style.flexDirection = "column";

          const title = document.createElement("span");
          title.textContent = bookmark.videoTitle;
          title.style.fontSize = "11px";
          title.style.color = "#666";

          const time = document.createElement("span");
          time.textContent = bookmark.title;
          time.style.color = "#ff0000";
          time.style.cursor = "pointer";

          time.onclick = () => {
            const url = `https://www.youtube.com/watch?v=${bookmark.videoId}&t=${bookmark.time}`;
            chrome.tabs.query({}, (tabs) => {
              const youtubeTab = tabs.find(
                (tab) => tab.url && tab.url.includes("youtube.com"),
              );
              if (youtubeTab) {
                chrome.tabs.update(youtubeTab.id, { url }, () => {
                  window.close();
                });
              } else {
                chrome.tabs.create({ url }, () => {
                  window.close();
                });
              }
            });
          };

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "delete-btn";
          const trashImg = document.createElement("img");
          trashImg.src = chrome.runtime.getURL("trash.png");
          trashImg.alt = "Delete";
          trashImg.style.width = "16px";
          trashImg.style.height = "16px";
          deleteBtn.appendChild(trashImg);

          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            chrome.storage.sync.get([bookmark.storageKey], (data) => {
              const list = data[bookmark.storageKey] || [];
              list.splice(bookmark.bookmarkIndex, 1);
              if (list.length === 0) {
                chrome.storage.sync.remove(bookmark.storageKey, loadAllBookmarks);
              } else {
                chrome.storage.sync.set(
                  { [bookmark.storageKey]: list },
                  loadAllBookmarks,
                );
              }
            });
          };

          info.appendChild(title);
          info.appendChild(time);
          li.appendChild(info);
          li.appendChild(deleteBtn);
          bookmarkList.appendChild(li);
        });

        loadMoreLi.remove();
        renderLoadMoreButton();
      };

      loadMoreLi.appendChild(loadMoreBtn);
      bookmarkList.appendChild(loadMoreLi);
    }
  }

  function showStatus(message, type) {
    statusText.textContent = message;
    statusText.className = `status ${type}`;
    statusText.style.display = "block";
    setTimeout(() => (statusText.style.display = "none"), 3000);
  }

  loadAllBookmarks();
});
