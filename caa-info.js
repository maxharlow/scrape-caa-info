var highland = require('highland')
var request = require('request')
var cheerio = require('cheerio')
var fs = require('fs')
var csvWriter = require('csv-write-stream')

var http = highland.wrapCallback(function (location, callback) {
    request(location, function (error, response, body) {
	var errorStatus = (response.statusCode >= 400) ? new Error(response.statusCode) : null
	response.body = body
	callback(error || errorStatus, response)
    })
})

console.log('Retrieving info...')

var alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')

var regmarks = highland(alphabet).flatMap(function (x) {
    return alphabet.map(function (y) {
	return x + y
    })
})

var regmarksLocations = regmarks.map(function (regmark) {
    return 'http://www.caa.co.uk/application.aspx?catid=60&pagetype=65&appid=1&mode=summary&regmark=' + regmark
})

var regmarksPages = regmarksLocations.flatMap(http)

var detailLocations = regmarksPages.flatMap(function (response) {
    var document = cheerio.load(response.body)
    var items = document('.items').text().match(/Showing 1 to 20 of (.*) items/)
    var count = items ? items[1] : 0 // the text won't appear if the regmark is invalid, so skip
    var links = []
    for (var i = 0; i < count; i++) {
	links.push(response.request.href.replace('summary', 'detail') + '&dataindex=' + i)
    }
    return links
})

var detailPages = detailLocations.flatMap(http)

var results = detailPages.map(function (response) {
    var document = cheerio.load(response.body)
    return {
	registrationMark: document('#currentModule_currentModule_Registration').text(),
	registrationPreviousId: document('#currentModule_currentModule_PreviousID').text(),
	registrationStatus: document('#currentModule_currentModule_Status').text(),
	registrationStatusTo: document('#currentModule_currentModule_ToLabel').text(),
	registrationStatusReason: document('#currentModule_currentModule_Reason').text(),
	registrationCurrentDate: document('#currentModule_currentModule_CurrentRegDate').text(),
	registrationDeregistrationDate: document('#currentModule_currentModule_DeRegDate').text(),
	aircraftManufacturer: document('#currentModule_currentModule_Manufacturer').text(),
	aircraftType: document('#currentModule_currentModule_Type').text(),
	ownerStatus: document('#currentModule_currentModule_OwnershipStatus').text(),
	ownerRegistration: document('#currentModule_currentModule_RegisteredOwners').text()
    }
})


results.through(csvWriter()).pipe(fs.createWriteStream('caa-info.csv'))
