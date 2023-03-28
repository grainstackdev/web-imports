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
  return [pkg, packagePath]
}

/*
Finds the dependency's package.json.

In the `file`, there was an import statement which resolves to a file somewhere.
The goal of this function is to find the package.json of the module being imported.
So, it should imitate node's resolution algorithm.

To resolve, node looks for a node_modules folder at the same level as the
top level package.json.

For reference, the top level package.json would be the main project's package.json
or it could also be the package.json of a module that was installed as a dep of the main project.

If node does not find the package in that node_modules location, then it will move
up parent folders until it finds a node_modules location which does have the package installed.

The package.json found must have a version which matches the requested version
by the top level package.json.
* */
async function getDependencyPackage(packageName, topLevelPackage, topPackagePath, file) {
  const modulesPackagePath = await escalade(topPackagePath, (dir, names) => {
    if (names.includes('node_modules')) {
      const packagePath = path.resolve(dir, 'node_modules', packageName, 'package.json')
      const exists = fs.existsSync(packagePath)
      if (exists) {
        return packagePath
      }
    }
  })
  if (!modulesPackagePath) return null
  const pkgContents = fs.readFileSync(modulesPackagePath, {encoding: "utf-8"})
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
      const [topPackage, topPackagePath] = await getTopLevelPackage(file)
      const depPackage = await getDependencyPackage(packageName, topPackage, topPackagePath, file)

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

      let relativeImportPath = resolve.exports(depPackage, bareSpecifier)?.[0]
      if (!relativeImportPath) {
        // This is not an esm package with exports field.

        if (bareSpecifier !== packageName) {
          // It has a subpath, but no exports field,
          // so it's treated like a commonjs subpath,
          // I.E. it's a file path.
          relativeImportPath = './' + bareSpecifier.split('/').slice(1).join('/')

          // .js is added if the extension is missing.
          // Please specify the extension if your file is not .js.
          if (!relativeImportPath.endsWith('.js')) {
            relativeImportPath += '.js'
          }
        } else {
          // Not a subpath, so import the "main" file.
          relativeImportPath = depPackage.module || depPackage.main || "index.js"
        }
      }

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