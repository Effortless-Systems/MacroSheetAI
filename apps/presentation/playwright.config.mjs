import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test',testMatch:'*.browser.mjs',use:{headless:true},reporter:'line'});
