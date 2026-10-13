// The mini window (ТЗ 31) in the main window: its section of the settings, between «Файлы» and «Клавиши».

import { registerSettings } from '../views';
import MiniSettings from '../MiniSettings.svelte';

registerSettings({ id: 'Мини-окно', icon: 'M2.5 4h15v12h-15zM10 10h6v5h-6z', order: 75, component: MiniSettings });
