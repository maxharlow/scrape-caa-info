const Highland = require('highland')
const Request = require('request')
const RetryMe = require('retry-me')
const Cheerio = require('cheerio')
const FS = require('fs')
const CSVWriter = require('csv-write-stream')

const http = Highland.wrapCallback((location, callback) => {
    const input = output => {
        Request(location, (error, response) => {
            const failure = error ? error : (response.statusCode >= 400) ? new Error(response.statusCode) : null
            output(failure, response)
        })
    }
    const times = {
        retries: -1,
        factor: 1.25,
        maxTimeout: 5 * 60 * 1000
    }
    RetryMe(input, times, callback)
})

function regmarks() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const regmarks = alphabet.map(x => alphabet.map(y => x + y)).join(',').split(',')
  return regmarks.map(regmark => {
      return {
          uri: 'http://publicapps.caa.co.uk/modalapplication.aspx?appid=1&mode=summary&regmark=' + regmark,
          regmark
      }
  })
}

function pages(response) {
    const document = Cheerio.load(response.body)
    const items = document('.items').text().match(/Showing 1 to 20 of (.+) items/)
    const count = items ? Number(items[1]) : 0 // the text won't appear if the regmark is invalid, so skip
    console.log('Scraping ' + count + ' registrations beginning with ' + response.request.regmark.toUpperCase() + '...')
    return Array(count).fill().map((_, i) => {
        return response.request.href.replace('summary', 'detail') + '&dataindex=' + i
    })
}

function results(response) {
    const document = Cheerio.load(response.body)
    const registrationMark = document('#currentModule_currentModule_Registration').text().trim()
    process.stdout.write(registrationMark + ', ')
    return {
        registrationMark,
        registrationPreviousId: document('#currentModule_currentModule_PreviousID').text().trim(),
        registrationStatus: document('#currentModule_currentModule_Status').text().trim(),
        registrationStatusTo: document('#currentModule_currentModule_ToLabel').text().trim(),
        registrationStatusReason: document('#currentModule_currentModule_Reason').text().trim(),
        registrationCurrentDate: document('#currentModule_currentModule_CurrentRegDate').text().trim(),
        registrationDeregistrationDate: document('#currentModule_currentModule_DeRegDate').text().trim(),
        aircraftManufacturer: document('#currentModule_currentModule_Manufacturer').text().trim(),
        aircraftType: document('#currentModule_currentModule_Type').text().trim(),
        ownerStatus: document('#currentModule_currentModule_OwnershipStatus').text().trim(),
        ownerRegistration: document('#currentModule_currentModule_RegisteredOwners').html().replace(/<br>/g, '\n').trim()
    }
}

Highland(regmarks())
    .flatMap(http)
    .flatMap(pages)
    .flatMap(http)
    .map(results)
    .errors(e => console.error(e.stack))
    .through(CSVWriter())
    .pipe(FS.createWriteStream('caa-info.csv'))
