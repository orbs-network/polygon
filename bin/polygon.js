#!/usr/bin/env node

const { create, destroy, status } = require("../lib/cli");
const { createOptions, destroyOptions, statusOptions } = require("../lib/cli/options");

require("yargs") // eslint-disable-line
  .command("create", "Create an Orbs node in the cloud", createOptions, create)
  .command("destroy", "Destroys an Orbs node", destroyOptions, destroy)
  .command("status", "Provides a status into the specific Orbs node", destroyOptions, status)
  .option("verbose", {
    alias: "v",
    default: false
  })
  .demandCommand()
  .help()
  .argv
