import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  generateRouteDataFromKmlFile,
  printRouteValidationReport,
} from './routeImport.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const defaultKmlPath = 'C:\\Users\\tomta\\Downloads\\2026 Solar Car Challenge.kml'
const inputPath = process.argv[2] ?? defaultKmlPath
const outputPath =
  process.argv[3] ?? path.join(projectRoot, 'src/data/routeData.json')

const routeData = await generateRouteDataFromKmlFile({
  inputPath,
  outputPath,
})

console.log(printRouteValidationReport(routeData))
console.log(`Wrote ${path.relative(projectRoot, outputPath)}`)
