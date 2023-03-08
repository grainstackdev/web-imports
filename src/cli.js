#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import glob from "glob"
import minimist from "minimist"
import chalk from 'ansi-colors'
import {transformImports} from './index.js'

const args = minimist(process.argv.slice(2))
const fileDirGlob = args['glob'] || args._[0] || (
  typeof args['write'] === 'string' && args['write'] !== 'true' ? args['write'] : null
)
const prefix = args['prefix'] || '/node_modules/'
const write = args['write'] === 'true' || args['write'] === true

if (!fileDirGlob) {
  throw new Error('Unable to determine file or glob.')
}
console.log(chalk.cyan("[web-imports]"), 'Transforming', fileDirGlob)

let g = fileDirGlob

try {
  const dirPath = path.resolve(process.cwd(), g)
  if (fs.lstatSync(dirPath).isDirectory()) {
    g = `${fileDirGlob}/**/*.{js,mjs}`
  }
} catch (err) {
}

glob(g, {}, async (err, files) => {
  for (const file of files) {
    const filepath = path.resolve(file)
    console.log(chalk.cyan("[web-imports]"), file)
    if (!fs.lstatSync(filepath).isDirectory()) {
      const str = fs.readFileSync(filepath, { encoding: "utf8" })
      const out = await transformImports(str, filepath, prefix)
      if (write) {
        fs.writeFileSync(filepath, out, "utf8")
      } else {
        console.log(out)
      }
    }
  }
})