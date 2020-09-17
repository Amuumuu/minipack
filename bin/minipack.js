#!/usr/bin/env node

const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');
const { resolve } = require('path');
const Bundler = require('..');

const depay = (ms) => new Promise(yes => setTimeout(yes, ms));

async function run() {
    const rootDir = process.cwd();
    const configAbsPath = resolve(rootDir, 'minipack.config.js');
    const exist = fs.existsSync(configAbsPath);
    let options = exist ? require(configAbsPath) : {};
    const bundler = new Bundler(options);
    const spin = ora('开始打包...');
    spin.start();
    await depay(500);
    try {
        bundler.bundle();
        spin.succeed('打包成功！');
    } catch (e) {
        spin.fail('打包失败！');
    }
}

run();