#! /usr/bin/env node
const path = require('path');
const { pathToFileURL } = require('url');

const run = async () => {
  const entryUrl = pathToFileURL(path.resolve(__dirname, '../src/index.mjs'));
  const { default: lib } = await import(entryUrl.href);
  await lib(process.argv.slice(2));
};

run().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
