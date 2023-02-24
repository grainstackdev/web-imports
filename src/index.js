import {resolve} from 'import-meta-resolve'
import chalk from 'ansi-colors'
import asyncReplace from './asyncReplace.js'
import escalade from 'escalade'
import fs from 'fs'
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// assumes this script is running from within node_modules.
let nodeModulesPath = path.resolve(__dirname, '../..')
if (!nodeModulesPath.endsWith('node_modules')) {
  // When developing this script, this branch should run.
  nodeModulesPath = path.resolve(__dirname, '../node_modules')
}

function getPackageName(bareSpecifier) {
  let packageName
  if (bareSpecifier.startsWith('@')) {
    packageName = bareSpecifier.split('/').slice(0, 2)
  } else {
    packageName = bareSpecifier.split('/')[0]
  }
  return packageName
}

async function getPackage(file) {
  const pkgPath = await escalade(file, (dir, names) => {
    if (names.includes('package.json')) {
      return 'package.json'
    }
  })
  const pkgContents = fs.readFileSync(pkgPath, {encoding: "utf-8"})
  const pkg = JSON.parse(pkgContents)
  return pkg
}

function makeReplacer(prefix, file) {
  return async function replacer(match, _1, bareSpecifier, _3, offset, string) {
    // Check if the package is a devDependencies
    const packageName = getPackageName(bareSpecifier)
    const pkg = await getPackage(file)
    if ((pkg.devDependencies || {})[packageName]) {
      return match
    }

    try {
      let url

      try {
        url = await resolve(bareSpecifier, import.meta.url)
        if (!url.startsWith('file://')) {
          // throw new Error('import was not a file:// but instead was ' + url)
          // console.warn(``)
          return match // equivalent to not replacing anything.
        }
      } catch (err) {
        if (bareSpecifier === 'preact' || bareSpecifier === 'react') {
          // Do not throw, these will be filled in with fallback values
          // in order to allow htm to be transformed without preact or react.
          url = ''
        } else {
          throw err
        }
      }

      const filepath = url.slice(7)
      const directImportPath = path.relative(nodeModulesPath, filepath)
      let absoluteImportPath = prefix + directImportPath

      if (!url) {
        if (bareSpecifier === 'preact') {
          absoluteImportPath = '/node_modules/preact/dist/preact.mjs'
        } else if (bareSpecifier === 'react') {
          absoluteImportPath = '/node_modules/react/index.js'
        }
      }

      return `${_1}${absoluteImportPath}${_3}`
    } catch (err) {
      if (err.message.startsWith('Cannot find package')) {
        const message = err.message.match(/Cannot find package '.*'/g)?.[0]
        console.warn(`${chalk.cyan('[web-imports]')} ${message}\n${chalk.yellow('File:')} ${file}\n${chalk.yellow('Line:')} ${match}`)
      } else {
        console.warn(`${chalk.cyan('[web-imports]')} ${err.message}\n${chalk.yellow('File:')} ${file}\n${chalk.yellow('Line:')} ${match}`)
      }
      return match
    }
  }
}

export async function transformImports(contents, file, prefix) {
  prefix = prefix || '/node_modules/'
  if (!file || !file.startsWith('/')) {
    throw new Error('An absolute filepath must be specified.')
  }

  // single line import statements
  let res = await asyncReplace(contents, /(?<=^|\n)(import.* (?:'|"))(?!\.?\.?\/|http)(.*)('|")/g, makeReplacer(prefix, file))

  // single line export statements
  res = await asyncReplace(res, /(?<=^|\n)(export.* from (?:'|"))(?!\.?\.?\/|http)(.*)('|")/g, makeReplacer(prefix, file))

  // multiple line import/export statements
  return await asyncReplace(res, /(?<=^|\n)((?:import|export) {\n(?:.|\n)+?\n} from (?:'|"))(?!\.?\.?\/|http)(.*)('|")/g, makeReplacer(prefix, file))
}

// es modules must be used because import.meta.url is used.
// module.exports = {
//   transformImports
// }