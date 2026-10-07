import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();

createApp().listen(config.PORT);
