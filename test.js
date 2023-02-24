import test from 'tape'
import {transformImports} from "./src/index.js";

const actual = `
import grainbox from 'grainbox'
import * as grainbox from 'grainbox/reactivity'
import {
  h
} from 'grainbox'
`

const expected = `
import grainbox from '/node_modules/grainbox/dist/esm/index.mjs'
import * as grainbox from '/node_modules/grainbox/dist/esm/reactivity.mjs'
import {
  h
} from '/node_modules/grainbox/dist/esm/index.mjs'
`

test('transformImports', async (t) => {
  const out = await transformImports(actual)
  t.equal(out, expected)
})



