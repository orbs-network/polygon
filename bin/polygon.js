#!/usr/bin/env node

const { create, destroy, update, status, bootstrapConfig } = require("../lib/cli");
const { createOptions, destroyOptions, updateOptions, networkStatusOptions, generateConfigOptions } = require("../lib/cli/options");

require("yargs") // eslint-disable-line
  .command("create", "Create an Orbs node in the cloud", createOptions, create)
  .command("destroy", "Destroys an Orbs node", destroyOptions, destroy)
  .option("verbose", {
    alias: "v",
    default: false
  })
  .command("update", "Updates a running node's topology and vChains version", updateOptions, update)
  .command("network-status", "Shows status of the whole network", networkStatusOptions, status)
  .command("bootstrap-config", "Generates bootstrap config", generateConfigOptions, bootstrapConfig)
  .demandCommand()
  .help()
  .argv
