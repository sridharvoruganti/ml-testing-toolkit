/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation

 * ModusBox
 * Georgi Logodazhki <georgi.logodazhki@modusbox.com> (Original Author)
 --------------
 ******/
const axios = require('axios').default
const cliProgress = require('cli-progress')
const report = require('../utils/report')
const logger = require('../utils/logger')
const fStr = require('node-strings')
const fs = require('fs')
const { promisify } = require('util')
const objectStore = require('../objectStore')
const slackBroadcast = require('../extras/slack-broadcast')
const TemplateGenerator = require('../utils/templateGenerator')
const { TraceHeaderUtils } = require('ml-testing-toolkit-shared-lib')

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

const sendTemplate = async (sessionId) => {
  const config = objectStore.get('config')
  try {
    const readFileAsync = promisify(fs.readFile)

    // Calculate the outbound request ID based on sessionId for catching progress notifications
    const traceIdPrefix = TraceHeaderUtils.getTraceIdPrefix()
    const currentEndToEndId = TraceHeaderUtils.generateEndToEndId()
    const outboundRequestID = traceIdPrefix + sessionId + currentEndToEndId

    const inputFiles = config.inputFiles.split(',')
    const template = await TemplateGenerator.generateTemplate(inputFiles)
    template.inputValues = JSON.parse(await readFileAsync(config.environmentFile, 'utf8')).inputValues

    let totalRequests = 0
    template.test_cases.forEach(testCase => {
      totalRequests += testCase.requests.length
    })
    bar.start(totalRequests, 0)
    await axios.post(`${config.baseURL}/api/outbound/template/` + outboundRequestID, template, { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
}

const handleIncomingProgress = async (progress) => {
  if (progress.status === 'FINISHED') {
    bar.stop()
    let passed
    try {
      passed = logger.outbound(progress.totalResult)
      const resultReport = await report.outbound(progress.totalResult)
      await slackBroadcast.sendSlackNotification(progress.totalResult, resultReport.uploadedReportURL)
    } catch (err) {
      console.log(err)
      passed = false
    }
    if (passed) {
      console.log(fStr.green('Terminate with exit code 0'))
      process.exit(0)
    } else {
      console.log(fStr.red('Terminate with exit code 1'))
      process.exit(1)
    }
  } else {
    bar.increment()
  }
}

module.exports = {
  sendTemplate,
  handleIncomingProgress
}
