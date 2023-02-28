import * as resolve from 'resolve.exports'
import {resolve as metaResolve} from 'import-meta-resolve'
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
    packageName = bareSpecifier.split('/').slice(0, 2).join('/')
  } else {
    packageName = bareSpecifier.split('/')[0]
  }
  return packageName
}

async function getTopLevelPackage(file) {
  const packagePath = await escalade(file, (dir, names) => {
    if (names.includes('package.json')) {
      return 'package.json'
    }
  })
  if (!packagePath) return null
  const pkgContents = fs.readFileSync(packagePath, {encoding: "utf-8"})
  const pkg = JSON.parse(pkgContents)
  return pkg
}

async function getDependencyPackage(packageName, topLevelPackage, file) {
  const modulesPath = await escalade(file, (dir, names) => {
    const lastTwoFolders = dir.split('/').slice(-2)
    const isInnerModules = lastTwoFolders[0] === 'node_modules' && lastTwoFolders[1] === topLevelPackage.name

    if (names.includes('node_modules') && !isInnerModules) {
      return 'node_modules'
    }
  })
  if (!modulesPath) return null
  const packagePath = path.resolve(modulesPath, packageName, 'package.json')
  if (!fs.existsSync(packagePath)) return null
  const pkgContents = fs.readFileSync(packagePath, {encoding: "utf-8"})
  const pkg = JSON.parse(pkgContents)
  return pkg
}

function makeReplacer(prefix, file) {
  // replacer should 2 never throw.
  return async function replacer(match, _1, bareSpecifier, _3, offset, string) {
    try {
      const modulesPath = await escalade(file, (dir, names) => {
        if (names.includes('node_modules')) {
          return 'node_modules'
        }
      }) || '/'

      // Check if the package is a devDependencies
      const packageName = getPackageName(bareSpecifier)
      const topPackage = await getTopLevelPackage(file)
      const depPackage = await getDependencyPackage(packageName, topPackage, file)

      const isDevDep = (topPackage.devDependencies || {})[packageName] ||
        !depPackage ||
        (depPackage.devDependencies || {})[packageName]
      if (isDevDep) {
        // devDeps are not transformed.
        return match
      }

      if (!depPackage || !topPackage) {
        // This could happen because the dep is not installed to node_modules,
        // and one of those reasons could be because the import is a built-in node:module.
        const url = await metaResolve(bareSpecifier, import.meta.url)
        if (url.startsWith('file://')) {
          throw new Error(`Cannot find package '${packageName}'`)
        } else {
          // non-files are not transformed.
          return match
        }
      }

      const relativeImportPath = resolve.exports(depPackage, bareSpecifier)?.[0] || depPackage.module || depPackage.main || "index.js"
      if (!relativeImportPath) {
        throw new Error(`Cannot find package '${packageName}'`)
      }

      const filepath = path.resolve(modulesPath, packageName, relativeImportPath)

      const directImportPath = path.relative(modulesPath, filepath)
      let absoluteImportPath = prefix + directImportPath

      // if (!url) {
      //   if (bareSpecifier === 'preact') {
      //     absoluteImportPath = '/node_modules/preact/dist/preact.mjs'
      //   } else if (bareSpecifier === 'react') {
      //     absoluteImportPath = '/node_modules/react/index.js'
      //   }
      // }

      return `${_1}${absoluteImportPath}${_3}`
    } catch (err) {
      console.error('err', err)
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