// the features' shortcuts first: the keys saved for them are read when the store starts
import './features/keys';
import './api/declare'; // the plugins' commands too (roadmap 1.1)
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyStored } from './appearance';

if ('__TAURI_INTERNALS__' in window) document.documentElement.classList.add('tauri');

applyStored(); // the appearance and the editor theme before the first paint

mount(App, { target: document.getElementById('app')! });
