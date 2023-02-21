#!/usr/bin/env node

import fs from 'fs'
import glob from "glob"
import minimist from "minimist"
import {transformImports} from './index.js'

const args = minimist(process.argv.slice(2))
const g = args['glob']
const prefix = args['prefix'] || '/node_modules/'

glob(g, {}, async (err, files) => {
  for (const file of files) {
    console.log("[web-imports]", file)
    const str = fs.readFileSync(file, { encoding: "utf8" })
    const out = await transformImports(str, prefix, file)
    fs.writeFileSync(file, out, "utf8")
  }
})