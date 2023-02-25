#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import glob from "glob"
import minimist from "minimist"
import chalk from 'ansi-colors'
import {transformBareImports} from './index.js'

const args = minimist(process.argv.slice(2))
const g = args['glob'] || args._[0]
const prefix = args['prefix'] || '/node_modules/'

glob(g, {}, async (err, files) => {
  for (const file of files) {
    const filepath = path.resolve(file)
    console.log(chalk.cyan("[web-imports]"), file)
    if (!fs.lstatSync(filepath).isDirectory()) {
      const str = fs.readFileSync(filepath, { encoding: "utf8" })
      const out = await transformBareImports(str, filepath, prefix)
      // console.log('out', out)
      fs.writeFileSync(filepath, out, "utf8")
    }
  }
})