import test from 'tape'
import fs from 'fs'
import path from 'path'
import {transformImports} from "./src/index.js";

const testFilePath = path.resolve('./_test.js')
const actual = fs.readFileSync(testFilePath, {encoding: "utf-8"})

const expected = `import path, { dirname } from 'path'
import {
  resolve
} from '/node_modules/import-meta-resolve/index.js'
import escalade from '/node_modules/escalade/dist/index.mjs'
import grainbox from 'grainbox'
import {render} from 'preact'
import {render} from 'react'
import '/node_modules/@yarnpkg/lockfile/index.js'`

test('transformImports', async (t) => {
  const out = await transformImports(actual, testFilePath)
  t.equal(out, expected)
})



