import { flushSync, mount } from 'svelte';
import '../../src/lib/styles.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
flushSync();
document.body.dataset.ready = 'true';
