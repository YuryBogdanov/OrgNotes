# Org

Нативное macOS-приложение для заметок, задач и агенды поверх обычных `.org`-файлов.
Прототип: Tauri 2 + Svelte 5 + CodeMirror 6.

## Запуск

```bash
npm install
npx tauri dev            # нативное окно
npm run dev              # только веб-версия на http://localhost:1420
```

Нужны Node.js и Rust (`brew install node rust`).

Папка с заметками: переменная `ORG_DIR`, по умолчанию `sample-notes/`.

```bash
ORG_DIR=~/notes npx tauri dev
```

## Принципы

- `.org`-файлы остаются источником истины, формат 1:1 с Emacs.
- Правки делаются патчами по тексту, документ не пересериализуется из дерева.
