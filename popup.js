document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("add");
  const bookmarkList = document.getElementById("list");
  const statusText = document.getElementById("status");

  if (!addButton || !bookmarkList) {
    console.error("Required elements not found in popup.html");
    return;
  }

  // Format seconds to readable time (MM:SS)
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Extract video ID from YouTube URL
  function getVideoId(url) {
    const urlObj = new URL(url);
    return urlObj.searchParams.get("v") || url.split("v=")[1]?.split("&")[0] || null;
  }

  // Get video title from URL or video page
  async function getVideoTitle(tab) {
    return new Promise((resolve) => {
      // First, clear any cached title by waiting
      setTimeout(() => {
        let attempts = 0;
        const maxAttempts = 7;  // Try more times
        
        function tryGetTitle() {
          chrome.tabs.sendMessage(tab.id, { action: "GET_TITLE" }, (response) => {
            if (chrome.runtime.lastError) {
              console.log("Content script error:", chrome.runtime.lastError);
              resolve("Untitled Video");
              return;
            }
            
            let title = response?.title || "Untitled Video";
            
            // Log the title we got
            console.log(`Attempt ${attempts}: Got title: "${title}"`);
            
            // Check if we got a valid, non-empty title
            if (title && 
                title !== "Untitled Video" && 
                title.trim().length > 3 &&
                !title.includes("undefined") &&
                !title.includes("null")) {
              
              console.log("✅ USING TITLE:", title);
              resolve(title);
            } else {
              attempts++;
              if (attempts < maxAttempts) {
                console.log(`Retrying... attempt ${attempts + 1}`);
                // Longer delay between retries
                setTimeout(tryGetTitle, 600);
              } else {
                console.log("Max attempts reached. Using:", title);
                resolve(title || "Untitled Video");
              }
            }
          });
        }
        
        tryGetTitle();
      }, 1200);  // Wait longer for YouTube to load
    });
  }

  // Add bookmark
  addButton.onclick = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes("youtube.com")) {
        showStatus("Please open a YouTube video first!", "error");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "GET_TIME" }, async (response) => {
        if (chrome.runtime.lastError) {
          showStatus("Please refresh the YouTube page first!", "error");
          return;
        }
        
        if (!response || !response.success) {
          showStatus("Could not get video timestamp", "error");
          return;
        }

        const timestamp = Math.floor(response.time);
        const videoId = getVideoId(tab.url);
        const videoTitle = await getVideoTitle(tab);
        const storageKey = `bookmarks_${videoId}`;

        chrome.storage.sync.get([storageKey], (data) => {
          const bookmarks = data[storageKey] || [];
          
          // Check for duplicate
          if (bookmarks.some(b => b.time === timestamp)) {
            showStatus("This timestamp is already bookmarked!", "warning");
            return;
          }

          // Add bookmark with title and video info
          const bookmarkObj = {
            time: timestamp,
            title: `${formatTime(timestamp)}`,
            videoId: videoId,
            videoTitle: videoTitle
          };

          bookmarks.push(bookmarkObj);
          chrome.storage.sync.set({ [storageKey]: bookmarks }, () => {
            showStatus("Bookmark added!", "success");
            loadAllBookmarks();
          });
        });
      });
    } catch (error) {
      console.error("Error adding bookmark:", error);
      showStatus("Error adding bookmark", "error");
    }
  };

  // Load and display ALL bookmarks from all videos
  function loadAllBookmarks() {
    chrome.storage.sync.get(null, (allData) => {
      bookmarkList.innerHTML = "";
      const allBookmarks = [];

      // Extract all bookmarks from storage
      for (const [key, bookmarks] of Object.entries(allData)) {
        if (key.startsWith("bookmarks_")) {
          if (Array.isArray(bookmarks) && bookmarks.length > 0) {
            bookmarks.forEach((bookmark, index) => {
              allBookmarks.push({
                ...bookmark,
                storageKey: key,
                bookmarkIndex: index
              });
            });
          }
        }
      }

      // Sort by video title, then by time
      allBookmarks.sort((a, b) => {
        const titleCompare = (a.videoTitle || "").localeCompare(b.videoTitle || "");
        if (titleCompare !== 0) return titleCompare;
        return a.time - b.time;
      });

      if (allBookmarks.length === 0) {
        bookmarkList.innerHTML = "<li style='color: #999; padding: 10px;'>No bookmarks yet. Add one!</li>";
        return;
      }

      // Group bookmarks by video
      const groupedByVideo = {};
      allBookmarks.forEach((bookmark) => {
        const videoTitle = bookmark.videoTitle || "Untitled Video";
        if (!groupedByVideo[videoTitle]) {
          groupedByVideo[videoTitle] = [];
        }
        groupedByVideo[videoTitle].push(bookmark);
      });

      // Display grouped bookmarks
      for (const [videoTitle, bookmarks] of Object.entries(groupedByVideo)) {
        // Bookmarks for this video
        bookmarks.forEach((bookmark) => {
          const li = document.createElement("li");
          li.className = "bookmark-item";

          // Create a container for title and time
          const infoContainer = document.createElement("div");
          infoContainer.style.display = "flex";
          infoContainer.style.flexDirection = "column";
          infoContainer.style.flex = "1";
          infoContainer.style.gap = "4px";

          // Video title
          const titleSpan = document.createElement("span");
          titleSpan.className = "bookmark-title";
          let displayTitle = videoTitle || "Untitled Video";
          displayTitle = displayTitle.trim();
          if (displayTitle.length > 35) {
            displayTitle = displayTitle.substring(0, 32) + "...";
          }
          titleSpan.textContent = `📺 ${displayTitle}`;
          titleSpan.style.fontSize = "11px";
          titleSpan.style.color = "#666";
          titleSpan.style.fontWeight = "500";
          titleSpan.title = videoTitle;

          // Timestamp
          const timeSpan = document.createElement("span");
          timeSpan.textContent = bookmark.title;
          timeSpan.style.cursor = "pointer";
          timeSpan.style.color = "#ff0000";
          timeSpan.style.fontSize = "14px";
          timeSpan.style.fontWeight = "600";

          // Navigate to video and timestamp on click
          timeSpan.onclick = () => {
            const videoUrl = `https://www.youtube.com/watch?v=${bookmark.videoId}&t=${bookmark.time}`;
            chrome.tabs.query({}, (tabs) => {
              const youtubeTab = tabs.find(tab => tab.url.includes("youtube.com"));
              if (youtubeTab) {
                chrome.tabs.update(youtubeTab.id, { url: videoUrl }, () => {
                  window.close();
                });
              } else {
                chrome.tabs.create({ url: videoUrl }, () => {
                  window.close();
                });
              }
            });
          };

          // Delete button with trash image
          const deleteBtn = document.createElement("button");
          deleteBtn.className = "delete-btn";
          
          // Create img element for trash icon
          const trashImg = document.createElement("img");
          trashImg.src = chrome.runtime.getURL("trash.png");
          trashImg.alt = "Delete";
          trashImg.style.width = "16px";
          trashImg.style.height = "16px";
          
          deleteBtn.appendChild(trashImg);
          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            const storageKey = bookmark.storageKey;
            chrome.storage.sync.get([storageKey], (data) => {
              const bookmarks = data[storageKey] || [];
              bookmarks.splice(bookmark.bookmarkIndex, 1);
              if (bookmarks.length === 0) {
                chrome.storage.sync.remove(storageKey, () => {
                  showStatus("Bookmark deleted", "success");
                  loadAllBookmarks();
                });
              } else {
                chrome.storage.sync.set({ [storageKey]: bookmarks }, () => {
                  showStatus("Bookmark deleted", "success");
                  loadAllBookmarks();
                });
              }
            });
          };

          infoContainer.appendChild(titleSpan);
          infoContainer.appendChild(timeSpan);
          li.appendChild(infoContainer);
          li.appendChild(deleteBtn);
          bookmarkList.appendChild(li);
        });
      }
    });
  }

  // Show status message
  function showStatus(message, type) {
    if (!statusText) return;
    statusText.textContent = message;
    statusText.className = `status ${type}`;
    statusText.style.display = "block";
    setTimeout(() => {
      statusText.style.display = "none";
    }, 3000);
  }

  // Initial load
  loadAllBookmarks();

  // Reload bookmarks when popup is shown
  window.addEventListener("focus", loadAllBookmarks);
});
