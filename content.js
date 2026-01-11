console.log("YouTube Bookmark content script loaded");

// Detect YouTube SPA video changes
let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log("🔄 YouTube video changed:", lastUrl);
  }
}).observe(document, { subtree: true, childList: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  //  Get current video time
  if (request.action === "GET_TIME") {
    const video = document.querySelector("video");

    if (video) {
      sendResponse({
        time: video.currentTime,
        success: true
      });
    } else {
      sendResponse({
        success: false,
        time: 0
      });
    }
  }

  //  Get real-time YouTube video title
  if (request.action === "GET_TITLE") {

    let title = "";

    // Always read live YouTube title (not meta tags)
    const ytTitle = document.querySelector("h1.title yt-formatted-string");

    if (ytTitle) {
      title = ytTitle.innerText.trim();
    } else {
      title = document.title.replace(" - YouTube", "").trim();
    }

    if (!title || title.length < 2) {
      title = "Untitled Video";
    }

    console.log("🔥 Fresh video title:", title);

    sendResponse({
      title,
      success: true
    });
  }

  //  Jump to timestamp
  if (request.action === "JUMP_TO") {
    const video = document.querySelector("video");

    if (video) {
      video.currentTime = request.time;
      video.play();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  }

});
