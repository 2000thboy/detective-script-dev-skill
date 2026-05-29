#!/usr/bin/env node
/**
 * Thin repo entrypoint. The canonical implementation lives in the packaged
 * skill so direct skill installs and repo CLI use the same runner.
 */

const path = require("path");

require(path.join(
  __dirname,
  "..",
  "..",
  "ops",
  "skills",
  "detective-script-dev",
  "scripts",
  "wolf-runner.js"
));
