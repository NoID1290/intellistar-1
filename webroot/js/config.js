var api_key = 'e1f10a1e78da46f5b10a1e78da96f525';

var appearanceSettings = {
    marqueeAd: ["network"],
    localWeatherID: "XXXXX", //Keep it at XXXXX to generate a random local weather ID. Otherwise, put a 5 digit number.
    iconSet: "2010", //Choices are 2007 or 2010. 2010 icons appear in 2010-present versions, 2007 is between 2006-2010.
    ldlType: 'both', //what you want to see on ldl. 'observations' = only observations / 'both' = both / if anything else is put here, the sim will default to only observations
    startupTime: 4000, //How long you want to wait for it to start up.
    graphicsPackage: 2010, //the package for graphics. 2007 will have blue text, while 2008 will have black text. Everything 2009 and above includes blue LDL. 2010 changes the icons.
    units: "metric", // "auto" (metric for Canada, imperial for US), "metric", or "imperial"
    version: "1.2"
}

var slideSettings = {
    flavor: '120',
    bulletin: true,
    precip: true,
    auto: true,
    order: [
        { function: "currentConditions", slideDelay: 8000 },
        { function: "mapCurrent", slideDelay: 8000 },
        { function: "radarDoppler", slideDelay: 8000 },
        { function: "localDoppler", slideDelay: 12000 },
        //{ function: "almanac", slideDelay: 8000 },
        //{ function: "airQuality", slideDelay: 8000 },
        //{ function: "outdoorActivity", slideDelay: 8000 },
        { function: "daypartForecast", slideDelay: 8000 },
        { function: "mapForecast", slides: 2, slideDelay: 7000 },
        { function: "localForecast", slides: 4, slideDelay: 7500 },
        { function: "weekAhead", slideDelay: 8000 },
    ]
}

var audioSettings = {
    enableMusic: true, //Self-explanatory. Default is true.
    shuffle: true, //Self-explanatory. Default is true.
    randomStart: true, //Also should be self-explanatory. Default is true.
    narrations: true, //Also should be self-explanatory. Default is true.
    vocallocal: false, //Only affects local forecast vocal local, changes the phrase from naming the exact date to just "your local forecast"
    order: [
        "Track 1",
        "Track 2",
        "Track 3",
        "Track 4",
        "Track 5",
        "Track 6",
        "Track 7",
        "Track 8",
        "Track 9",
        "Track 10",
        "Track 11",
        "Track 12",
    ],
    offset: 0 //How far in you want the song to start. An offset of 10 will start the song 10 seconds in.
}

var locationSettings = {
    fetchIntervalMinutes: 5,
    mainCity: {
        autoFind: false,
        displayname: "",
        extraname: "",
        type: "geocode",
        val: ""
    },
    eightCities: {
        autoFind: false,
        cities: []
    },
    mapCities: {
        leftPos: -3353,
        topPos: 1297,
        map: [],
        autoFind: false
    },
    radarCities: {
        local: [
            { locationName: "", dotTopPos: "", dotLeftPos: "", nameTopMargin: "", nameLeftMargin: "" }
        ],
        regional: []
    }
}

var alertTestSettings = {
    enabled: false,
    mode: "off", // off | single | all | quebec
    disasterType: "tornado", // alias or full alert name when mode is "single"
    includeCrawl: true // when true, severe alerts trigger the crawl + tones
}