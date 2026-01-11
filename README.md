# 🎬 YouTube Timestamp Bookmark Chrome Extension

A lightweight Chrome extension that helps users save and manage important moments in YouTube videos. With one click, users can bookmark the current timestamp and instantly return to any saved moment, making video learning and content review faster and more efficient.

## 🚀 Features
- Save current YouTube video timestamp
- View all saved bookmarks
- Click any bookmark to jump to that exact moment
- Simple and clean popup UI

## 🛠 Tech Stack
- JavaScript
- HTML
- CSS
- Chrome Extensions API

## 📂 Project Structure

YouTube-bookmark-extension/
│
├── manifest.json        # Chrome extension configuration and permissions
├── popup.html           # UI layout of the extension popup
├── popup.js             # Handles bookmark actions and UI updates
├── content.js           # Interacts with YouTube to fetch video time and title
├── icons/               # Extension icons (logo, trash, etc.)
└── README.md            # Project documentation

## ⚙️ How It Works

1. The extension runs a content script on YouTube pages to detect the currently playing video.
2. When the user clicks **Add Bookmark**, the popup sends a request to the content script.
3. The content script returns the current timestamp and video title.
4. This data is saved using Chrome Storage and displayed in the popup.
5. When a saved timestamp is clicked, the video opens and plays from that exact moment.

## 🧠 Use Cases

- Students saving important lecture points  
- Developers bookmarking tutorials  
- Content creators marking reference moments  
- Anyone who wants quick access to key video parts  

## 🏁 Installation

1. Download or clone this repository  
2. Open Chrome and go to `chrome://extensions`  
3. Enable **Developer mode**  
4. Click **Load unpacked**  
5. Select the project folder  
6. The extension is now ready to use  


