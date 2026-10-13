// The built-in features (roadmap 0.3) became the built-in plugins (ТЗ 27–29). What the core kept under their old ids
// — settings in config.json or under the old names, tabs of a saved layout — moves to them; then the plugins that are
// on declare what their manifests say.

import './keys';

// ---- Inbox and its review: the built-in plugin «inbox» (ТЗ 28); the quick entry and the Inbox file stay the core's
import './inboxMigration';

// ---- the goals of the quarter: the built-in plugin «quarter-goals» (ТЗ 27)
import './goalsMigration';

// ---- the calendar: the built-in plugin «calendar» (ТЗ 29); the month under the Inbox review's card stays the core's
import './calendarMigration';

// ---- the mini window (ТЗ 31): a part of the core; its settings' section
import './mini';

// the plugins that are on: what their manifests declare (roadmap 1.1); their code is started by App once drawn
import '../api/host.svelte';
