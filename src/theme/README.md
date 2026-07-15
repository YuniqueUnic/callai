# Theme CSS layout

`global.css` is an **import index only**. Cascade order is intentional — do not reorder casually.

| File | Responsibility |
|------|----------------|
| `tokens.css` | Design tokens (`:root` / dark) + early library ink overrides |
| `window-chrome.css` | Transparent rounded window shell |
| `header-actions.css` | Header tools + icon buttons |
| `layout-cards.css` | Main content + card surfaces |
| `fab-base.css` | Base FAB styles |
| `forms.css` | Form fields |
| `logs-empty.css` | Empty states + log cards |
| `settings-segmented.css` | Segmented controls / settings sections |
| `pickers-time.css` | Time picker wheels |
| `tabs-icons.css` | Bottom tabs + square icons |
| `header-immersive.css` | Immersive page headers + island clock |
| `shell-sea.css` | Shell fill, floating tabs, sea footer |
| `motion-shell.css` | Motion, running cards, viewport fill |
| `home.css` | Home hero + list rhythm |
| `edit-page.css` | Edit overlay stack |
| `toast-drawer.css` | Toast + logs drawer |
| `pickers-extra.css` | Duration / timezone pickers |
| `dark-forms.css` | Dark contrast for forms/cards |
| `dark-overlays.css` | Dark modal/drawer/popup |
| `titlebar.css` | Custom titlebar chrome |
| `titlebar-layout.css` | Content clearance under titlebar |
| `tabs-keepalive.css` | Keep-alive tab panes + about |
| `select-popup-dark.css` | Select/picker dark popups |
| `window-final.css` | Rounded-window FINAL + FAB cluster |
| `plugins.css` | Plugins page |
| `provider-picker.css` | Provider wheel picker |
| `chrome-finish.css` | Tab anti-squeeze + idle opacity |
| `model-autocomplete.css` | Model autocomplete |
| `ai-chat.css` | AI assistant page (imported from `main.tsx`, not via index) |

When adding styles: put them in the matching module; keep each file focused and under ~400 lines when practical.
