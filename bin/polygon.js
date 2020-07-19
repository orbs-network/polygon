#!/usr/bin/env node

const { create, destroy } = require("../lib/cli");
const { createOptions, destroyOptions } = require("../lib/cli/options");

require("yargs") // eslint-disable-line
  .command("create", "Create an Orbs node in the cloud", createOptions, create)
  .command("destroy", "Destroys an Orbs node", destroyOptions, destroy)
  .option("verbose", {
    alias: "v",
    default: false
  })
  .demandCommand()
  .help()
  .argv
