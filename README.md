<div align="center">
  <h1>🚀 Coursera Skip Tool</h1>
  <p><strong>A clean, open-source browser extension that automatically marks Coursera video lectures and readings as completed.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
    <img src="https://img.shields.io/badge/manifest-V3-purple.svg" alt="Manifest V3">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
    <img src="https://img.shields.io/badge/status-active-success.svg" alt="Status">
  </p>
</div>

## 🌟 Introduction

Coursera Skip Tool is a **transparent, from-scratch browser extension** that automates Coursera course items. Unlike other versions circulating online that may contain harmful code (cookie stealing, data exfiltration), this repository provides a fully auditable, clean implementation.

**There are no hidden scripts, no data collection, and no remote control behavior.** Every network request the extension makes goes only to `www.coursera.org`.

## ✨ Features

- **✅ Skip Current Item:** Instantly mark the video lecture or reading you're currently viewing as completed.
- **✅ Complete Entire Course:** Bulk-complete every video and reading in a course with a live progress bar and automatic rate-limit friendly batching.
- **✅ Page Analysis Panel:** Shows the detected content type, item ID, and course slug for the current page.
- **✅ Clean & Fast:** Lightweight Manifest V3 extension — no frameworks, no bloat, no tracking.

## 📦 Installation

### From source

1. Download or clone this repository and extract it.
2. Open your Chromium-based browser (Chrome, Edge, Brave) and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select this folder (`coursera-skip-tool`).
5. Open any course page on Coursera and click the extension icon. 🎉

### From a release

1. Download the `.zip` from the [Releases](../../releases) page and extract it.
2. Follow steps 2–5 above.

## 🕹️ Usage

| Button | What it does |
|---|---|
| **Complete Current Item** | Marks the lecture/reading open in the current tab as completed |
| **Complete Entire Course** | Fetches the full course syllabus and completes every video & reading in batches |
| **Refresh** | Re-analyzes the current page |

> **Note:** The tool only works for courses you are **enrolled** in, and you must be logged in to Coursera. After a bulk run, refresh the page (F5) to see updated progress.

## 🔒 Security & Privacy

This extension was audited before publication:

- **Network:** all requests go exclusively to `https://www.coursera.org` — no third-party endpoints.
- **Permissions:** `storage`, `tabs`, `activeTab`, plus a host permission scoped to Coursera only.
- **No** `eval`, no dynamic code execution, no cookie reading, no web request interception, no remote code loading.
- The only external resource is the Google Fonts stylesheet used by the popup UI.

## 🗺️ Roadmap

- ⏳ Quiz auto-solver (planned, **not yet implemented**)
- ⏳ Multi-language quiz support
- ⏳ Auto-enrollment for courses within a specialization
- ⏳ Custom keyboard shortcuts

## ⚖️ Disclaimer

This tool is created for **educational and research purposes** to demonstrate browser automation capabilities. Use it responsibly and in accordance with [Coursera's Terms of Service](https://www.coursera.org/about/terms). The authors are not responsible for any misuse.

## 🤝 Contributing

Issues and pull requests are welcome! Please keep the extension free of tracking, remote code, and unnecessary permissions.

## 📄 License

Released under the [MIT License](LICENSE).
