# Шаблон плагина Panopticon

TypeScript и Svelte, сборка в один `main.js`. Как писать и ставить плагин: [docs/plugins/README.md](../../docs/plugins/README.md).

```bash
npm install
npm run build        # dist/main.js и dist/manifest.json
```

Положите `dist` в папку плагинов приложения под именем `id` из `manifest.json` («Настройки → Плагины → Открыть папку плагинов»), затем «Перезагрузить плагины».

`panopticon-api.ts` — копия `src/api/index.ts` приложения: типы API и `definePlugin`. Обновляйте её вместе с приложением.

## Публикация

- **Каталог.** Поставьте тег с версией манифеста (`git tag 0.1.0 && git push --tags`) — `.github/workflows/release.yml` соберёт релиз с `manifest.json` и `main.js`. Затем пришлите PR в [каталог](https://github.com/Panopticon-Org-Notes/plugins).
- **По ссылке на git** (плагины организации). Закоммитьте собранный `dist/` в тег релиза — приложение берёт файлы из корня или из `dist/`.

Подробнее — [docs/plugins/README.md](../../docs/plugins/README.md#публикация).
