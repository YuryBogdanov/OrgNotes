import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyStored } from './appearance';

if ('__TAURI_INTERNALS__' in window) document.documentElement.classList.add('tauri');

applyStored(); // the appearance and the editor theme before the first paint

mount(App, { target: document.getElementById('app')! });
