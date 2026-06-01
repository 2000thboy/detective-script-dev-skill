#!/usr/bin/env node
/**
 * Thin repo entrypoint for Fanqie CLI adapter.
 * The canonical implementation lives in the packaged skill.
 */

const path = require("path");

require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "ops",
  "skills",
  "detective-script-dev",
  "scripts",
  "fanqie-cli.js"
));
