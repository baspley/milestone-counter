# Milestone Counter — PWA

A personal iPhone app that counts down to or up from important dates, celebrating milestones along the way.

## Project Phases
- **Phase 1 (current):** Progressive Web App (HTML/CSS/JS)
- **Phase 2 (planned):** Native SwiftUI app

## Files
```
milestone-counter/
├── index.html      — App shell and all three screens (list, detail, form)
├── style.css       — All styles, dark/light themes, animations
├── app.js          — All application logic
├── manifest.json   — PWA manifest (enables "Add to Home Screen")
├── sw.js           — Service worker (enables offline use)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Features
- Multiple named timers (count up or count down)
- Live display: days / hours / minutes / seconds
- 15 configurable milestone thresholds (7d → 5 years)
- Preset milestone messages with random selection
- Dark mode by default, with light mode toggle
- Animated milestone celebration overlay
- Full offline support via service worker
- Data persists in localStorage

## Hosting (GitHub Pages)
1. Create a GitHub account at https://github.com
2. Create a new repository named `milestone-counter`
3. Upload all files (drag & drop in the GitHub UI)
4. Go to Settings → Pages → Source: main branch, root folder
5. Your app will be live at `https://yourusername.github.io/milestone-counter`
6. On iPhone: open in Safari → Share → Add to Home Screen

## Future: Claude API Integration (Phase 1b)
When adding AI-generated messages:
- Add an API key input in settings
- Store the key in localStorage (never commit it to GitHub)
- Call the Claude API only when a milestone fires
- Fall back to preset messages if offline or API fails
