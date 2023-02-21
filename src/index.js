import {resolve} from 'import-meta-resolve'
import asyncReplace from 'async-replace'
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// assumes this script is running from within node_modules.
let nodeModulesPath = path.resolve(__dirname, '../..')
if (!nodeModulesPath.endsWith('node_modules')) {
  // When developing this script, this branch should run.
  nodeModulesPath = path.resolve(__dirname, '../node_modules')
}

function makeReplacer(prefix, file) {
  return function replacer(match, _1, bareSpecifier, _3, offset, string, done) {
    resolve(bareSpecifier, import.meta.url).then(url => {
      if (!url.startsWith('file://')) {
        // throw new Error('import was not a file:// but instead was ' + url)
        // console.warn(``)
        return done(match) // equivalent to not replacing anything.
      }
      const filepath = url.slice(7)
      const directImportPath = path.relative(nodeModulesPath, filepath)
      const absoluteImportPath = prefix + directImportPath
      done(null, `${_1}${absoluteImportPath}${_3}`)
    }).catch(err => {
      if (err.message.startsWith('Cannot find package')) {
        // const message = err.message.match(/Cannot find package '.*'/g)?.[0]
        console.warn(`[web-imports] ${err.message}\nFile: ${file}\nLine: ${match}`)
      } else {
        console.warn(`[web-imports] ${err.message}`)
      }
      done(match)
    })
  }
}

export async function transformImports(contents, prefix, file) {
  prefix = prefix || '/node_modules/'
  file = file || 'Pass in filename for debugging purposes.'
  return new Promise((resolve) => {
    // todo skip commented imports
    asyncReplace(contents, /((?:import|export).* (?:'|"))(?!\.\.?\/|http)(.*)('|")/g, makeReplacer(prefix, file), (err, result) => {
      if (err) {
        // console.error(err)
      }
      resolve(result || contents)
    })
  })
}

// es modules must be used because import.meta.url is used.
// module.exports = {
//   transformImports
// }