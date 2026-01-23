document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const addButton = document.getElementById("add");
  const bookmarkList = document.getElementById("list");
  const statusText = document.getElementById("status");

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

  if (!addButton || !bookmarkList) {
    console.error("Required elements not found in popup.html");
    return;
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

            if (bookmarks.some((b) => b.time === timestamp)) {
              showStatus("This timestamp is already bookmarked!", "warning");
              return;
            }

            bookmarks.push({
              time: timestamp,
              title: formatTime(timestamp),
              videoId,
              videoTitle,
            });

            chrome.storage.sync.set({ [storageKey]: bookmarks }, () => {
              showStatus("Bookmark added!", "success");
              loadAllBookmarks();
            });
          });
        },
      );
    } catch {
      showStatus("Error adding bookmark", "error");
    }
  };

  function loadAllBookmarks() {
    chrome.storage.sync.get(null, (allData) => {
      bookmarkList.innerHTML = "";
      const allBookmarks = [];

      for (const [key, bookmarks] of Object.entries(allData)) {
        if (key.startsWith("bookmarks_")) {
          bookmarks.forEach((bookmark, index) => {
            allBookmarks.push({
              ...bookmark,
              storageKey: key,
              bookmarkIndex: index,
            });
          });
        }
      }

      if (allBookmarks.length === 0) {
        bookmarkList.innerHTML = `
      <li class="empty-state">
      <span class="emoji">🎬</span>
      <div>No timestamps saved yet.</div>
      <div>Start bookmarking!</div>
      </li>
      `;
        return;
      }

      allBookmarks.sort(
        (a, b) =>
          (a.videoTitle || "").localeCompare(b.videoTitle || "") ||
          a.time - b.time,
      );

      allBookmarks.forEach((bookmark) => {
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
    });
  }

  function showStatus(message, type) {
    statusText.textContent = message;
    statusText.className = `status ${type}`;
    statusText.style.display = "block";
    setTimeout(() => (statusText.style.display = "none"), 3000);
  }

  loadAllBookmarks();
});
