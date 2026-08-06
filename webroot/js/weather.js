var weatherInfo = {
    specialModes: {
        precip: false,
        bulletin: false
    },
    bulletin: {
        enabled: false,
        alerts: [],
        crawlAlert: {
            enabled: false,
            alert: undefined
        }
    },
    currentConditions: {
        humidity: "",
        pressure: { trend: "", val: "" },
        wind: "",
        dewpoint: "",
        gusts: "",
        icon: "",
        cond: "",
        temp: "",
        visibility: "",
        feelslike: { type: "", val: "" },
        noReport: false
    },
    eightCities: {
        noReport: false,
        cities: []
    },
    dayDesc: {
        noReport: false,
        days: []
    },
    weekAhead: {
        noReport: false,
        days: []
    },
    almanac: {
        noReport: false,
        stationname: "",
        days: [],
        yesterday: { high: "", low: "" },
        average: { high: "", low: "" },
        record: { high: "", recordYearHigh: "", low: "", recordYearLow: "" },
        moonphases: []
    },
    airQuality: {
        category: "",
        categoryIndex: 0,
        pollutants: []
    },
    outdoorActivity: {
        noReport: false,
        time: "",
        temp: "",
        cond: "",
        icon: "",
        wind: "",
        bg: 1,
        feelslike: {type:undefined,val:""}
    },
    daypartForecast: {
        noReport: false,
        times: []
    },
    map: {
        days: [],
        mapCities: [
            //{current: {}, forecast: {}}
        ],
    },
    radarUnavailable: false,
    monthlyPrecip: "",
}

var dataRefreshState = {
    fetchIntervalMinutes: 5,
    lastFetchAttempt: 0,
    lastSuccessful: {
        forecast: null,
        alerts: null,
        radar: null
    }
};

function getFetchIntervalMs() {
    var configured = Number(locationSettings && locationSettings.fetchIntervalMinutes);
    if (!Number.isFinite(configured) || configured <= 0) {
        configured = 5;
    }
    dataRefreshState.fetchIntervalMinutes = configured;
    return Math.round(configured * 60 * 1000);
}

function formatTimestamp(ts) {
    if (!ts) return "--";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function updateLastUpdatedIndicator() {
    var forecastStamp = formatTimestamp(dataRefreshState.lastSuccessful.forecast);
    var alertsStamp = formatTimestamp(dataRefreshState.lastSuccessful.alerts);
    var radarStamp = formatTimestamp(dataRefreshState.lastSuccessful.radar);
    $(".data-updated")
        .text(`Weather Data Updated - Forecast ${forecastStamp} | Alerts ${alertsStamp} | Radar ${radarStamp}`)
        .removeClass("error");
}

function markFeedSuccess(feedName) {
    dataRefreshState.lastSuccessful[feedName] = Date.now();
    updateLastUpdatedIndicator();
}

window.markFeedSuccess = markFeedSuccess;

var alertTestRuntime = {
    enabled: false,
    mode: "off",
    disasterType: "",
    includeCrawl: true,
    initialized: false
};

var ALERT_TYPE_ALIASES = {
    amber: "AMBER Alert",
    tornado: "Tornado Warning",
    "severe-thunderstorm": "Severe Thunderstorm Warning",
    severe: "Severe Thunderstorm Warning",
    "flash-flood": "Flash Flood Warning",
    flood: "Flood Warning",
    hurricane: "Hurricane Warning",
    tsunami: "Tsunami Warning",
    blizzard: "Blizzard Warning",
    "winter-storm": "Winter Storm Warning",
    "ice-storm": "Ice Storm Warning",
    wind: "High Wind Warning",
    heat: "Heat Warning",
    wildfire: "Fire Warning",
    fire: "Fire Warning",
    earthquake: "Earthquake Warning",
    volcano: "Volcano Warning",
    ashfall: "Ashfall Warning"
};

var QUEBEC_ALERT_TYPES = [
    "Alerte AMBER",
    "AMBER Alert",
    "Alerte d'urgence civile",
    "Civil Emergency Message",
    "Evacuation Immediate",
    "Shelter In Place Warning",
    "911 Telephone Outage Emergency"
];

function normalizeDisasterAlertName(typeOrName) {
    if (!typeOrName) {
        return null;
    }

    var raw = String(typeOrName).trim();
    if (!raw) {
        return null;
    }

    if (warningSettings[raw]) {
        return raw;
    }

    var lowered = raw.toLowerCase();
    if (ALERT_TYPE_ALIASES[lowered]) {
        return ALERT_TYPE_ALIASES[lowered];
    }

    var allNames = Object.keys(warningSettings);
    for (let i = 0; i < allNames.length; i++) {
        if (allNames[i].toLowerCase() === lowered) {
            return allNames[i];
        }
    }

    return null;
}

function getDisasterAlertCatalog() {
    var names = Object.keys(warningSettings).filter((name) => {
        var rule = warningSettings[name];
        if (!rule || rule.included !== true) {
            return false;
        }
        return name.endsWith("Warning") || name.startsWith("Alerte");
    });

    names.sort((a, b) => {
        var ap = warningSettings[a] ? warningSettings[a].priority : 999;
        var bp = warningSettings[b] ? warningSettings[b].priority : 999;
        return ap - bp;
    });
    return names;
}

function buildTestBulletinAlert(name, index) {
    var rule = warningSettings[name] || { priority: 125, severe: false };
    return {
        name: name,
        significance: "W",
        desc: `${name} TEST MESSAGE - THIS IS ONLY A TEST.`,
        detailKey: `test-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${index}`,
        severity: rule.severe ? "Severe" : "Moderate",
        priority: rule.priority
    };
}

function buildTestCrawlAlert(name) {
    var rule = warningSettings[name] || { priority: 125, severe: false };
    return {
        name: name,
        code: "TEST",
        type: "Alert",
        significance: "W",
        description: `THIS IS A TEST ${name.toUpperCase()} FOR THIS LOCAL FORECAST AREA. THIS IS ONLY A TEST.`,
        severe: !!rule.severe,
        priority: rule.priority,
        detailKey: `crawl-test-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`
    };
}

function applyAlertTestSet(alertNames, includeCrawl) {
    weatherInfo.bulletin.enabled = false;
    weatherInfo.bulletin.alerts = [];
    weatherInfo.bulletin.crawlAlert.enabled = false;
    weatherInfo.bulletin.crawlAlert.alert = undefined;
    weatherInfo.specialModes.bulletin = false;

    if (!Array.isArray(alertNames) || alertNames.length === 0) {
        endAlertCrawl();
        return;
    }

    var selectedNames = alertNames.filter((name) => warningSettings[name]);
    if (selectedNames.length === 0) {
        endAlertCrawl();
        return;
    }

    weatherInfo.bulletin.enabled = true;
    weatherInfo.specialModes.bulletin = true;

    var crawlName = null;
    if (includeCrawl) {
        crawlName = selectedNames.find((name) => warningSettings[name] && warningSettings[name].severe) || selectedNames[0];
        weatherInfo.bulletin.crawlAlert.enabled = true;
        weatherInfo.bulletin.crawlAlert.alert = buildTestCrawlAlert(crawlName);
        setTimeout(startAlertCrawl, 150);
    } else {
        endAlertCrawl();
    }

    var alerts = [];
    for (let i = 0; i < selectedNames.length; i++) {
        if (selectedNames[i] === crawlName) {
            continue;
        }
        alerts.push(buildTestBulletinAlert(selectedNames[i], i));
    }

    weatherInfo.bulletin.alerts = alerts.sort((a, b) => a.priority - b.priority);
    markFeedSuccess("alerts");
}

function getRuntimeAlertTestState() {
    if (!alertTestRuntime.initialized) {
        var config = (typeof alertTestSettings === "object" && alertTestSettings) ? alertTestSettings : {};
        alertTestRuntime.enabled = !!config.enabled;
        alertTestRuntime.mode = (config.mode || "off").toLowerCase();
        alertTestRuntime.disasterType = config.disasterType || "";
        alertTestRuntime.includeCrawl = config.includeCrawl !== false;

        try {
            var params = new URLSearchParams(window.location.search || "");
            if (params.has("alertTest")) {
                var requested = (params.get("alertTest") || "").trim().toLowerCase();
                if (requested === "off") {
                    alertTestRuntime.enabled = false;
                    alertTestRuntime.mode = "off";
                } else if (requested === "all") {
                    alertTestRuntime.enabled = true;
                    alertTestRuntime.mode = "all";
                } else if (requested === "quebec" || requested === "quebec-en-alerte") {
                    alertTestRuntime.enabled = true;
                    alertTestRuntime.mode = "quebec";
                } else if (requested) {
                    alertTestRuntime.enabled = true;
                    alertTestRuntime.mode = "single";
                    alertTestRuntime.disasterType = requested;
                }
            }

            if (params.has("alertTestCrawl")) {
                var crawlRaw = (params.get("alertTestCrawl") || "").toLowerCase();
                alertTestRuntime.includeCrawl = crawlRaw !== "0" && crawlRaw !== "false" && crawlRaw !== "no";
            }
        } catch (error) {
            console.warn("Failed to parse alert test URL params:", error);
        }

        alertTestRuntime.initialized = true;
    }

    return alertTestRuntime;
}

function applyAlertTestModeIfNeeded() {
    var state = getRuntimeAlertTestState();
    if (!state.enabled || state.mode === "off") {
        return false;
    }

    if (state.mode === "all") {
        applyAlertTestSet(getDisasterAlertCatalog(), state.includeCrawl);
        return true;
    }

    if (state.mode === "quebec") {
        applyAlertTestSet(QUEBEC_ALERT_TYPES, state.includeCrawl);
        return true;
    }

    if (state.mode === "single") {
        var normalized = normalizeDisasterAlertName(state.disasterType);
        if (!normalized) {
            console.warn(`Unknown alert test type '${state.disasterType}'. Falling back to live alerts.`);
            return false;
        }
        applyAlertTestSet([normalized], state.includeCrawl);
        return true;
    }

    return false;
}

function refreshSlidesForAlertTest() {
    if (typeof flavorPicker === "function") {
        slideFlavor = flavorPicker(slideSettings.flavor, {
            bulletin: weatherInfo.specialModes.bulletin,
            precip: weatherInfo.specialModes.precip
        });
    }
}

function setAlertTestState(nextState) {
    var state = getRuntimeAlertTestState();
    state.enabled = !!nextState.enabled;
    state.mode = nextState.mode || "off";
    state.disasterType = nextState.disasterType || "";
    state.includeCrawl = nextState.includeCrawl !== false;
}

window.alertTest = {
    listTypes: function () {
        var catalog = getDisasterAlertCatalog();
        console.log("Available disaster alert test types:", catalog);
        return catalog;
    },
    trigger: async function (typeOrName, options) {
        var name = normalizeDisasterAlertName(typeOrName);
        if (!name) {
            console.warn(`Unknown alert type '${typeOrName}'. Use alertTest.listTypes() to see valid values.`);
            return false;
        }
        setAlertTestState({
            enabled: true,
            mode: "single",
            disasterType: name,
            includeCrawl: !(options && options.includeCrawl === false)
        });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    triggerAll: async function (options) {
        setAlertTestState({
            enabled: true,
            mode: "all",
            includeCrawl: !(options && options.includeCrawl === false)
        });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    triggerQuebec: async function (options) {
        setAlertTestState({
            enabled: true,
            mode: "quebec",
            includeCrawl: !(options && options.includeCrawl === false)
        });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    clear: async function () {
        setAlertTestState({ enabled: false, mode: "off", disasterType: "", includeCrawl: true });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    status: function () {
        return { ...getRuntimeAlertTestState() };
    },
    help: function () {
        console.log("alertTest.trigger('tornado')");
        console.log("alertTest.trigger('Alerte de tornade')");
        console.log("alertTest.triggerAll()");
        console.log("alertTest.triggerQuebec()");
        console.log("alertTest.clear()");
        console.log("URL params: ?alertTest=tornado | ?alertTest=all | ?alertTest=quebec | ?alertTestCrawl=false");
    }
};

window.triggerAlertTest = window.alertTest.trigger;
window.triggerQuebecAlerteTest = window.alertTest.triggerQuebec;

async function grabData() {
    var fetchIntervalMs = getFetchIntervalMs();
    if (dataRefreshState.lastFetchAttempt && Date.now() - dataRefreshState.lastFetchAttempt < fetchIntervalMs) {
        return;
    }
    dataRefreshState.lastFetchAttempt = Date.now();

    $("#startbutton").css("opacity", "0.5");
    $("#startbutton").css("pointer-events", "none");
    weatherInfo.specialModes.bulletin = false;
    weatherInfo.specialModes.precip = false;
    var now = Date.now();
    await grabCC();
    await grabNearbyCC();
    await grabLocalForecast();
    grabMonthlyPrecip();
    await grabAirQuality();
    await grabAlmanac();
    await grabDaypartForecast();
    await grabOutdoorActivityData();
    await grabMapCityData();
    await grabAlerts();
    if (typeof window.refreshRadarFrames === "function") {
        await window.refreshRadarFrames();
    }
    console.log(`Weather grab done in ${Date.now() - now}ms`);
    console.log(weatherInfo);
    setTimeout(() => {
        slideFlavor = flavorPicker(slideSettings.flavor, {bulletin: weatherInfo.specialModes.bulletin, precip: weatherInfo.specialModes.precip});
        console.log(slideFlavor);
        setTimeout(() => {
            $("#startbutton").css("opacity", "");
            $("#startbutton").css("pointer-events", "");
        }, 100);
    }, 250);
}
async function grabCC() {
    $.getJSON("https://api.weather.com/v3/wx/observations/current?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&units=" + getUnits() + "&language=en-US&format=json&apiKey=" + api_key, function (data) {
        weatherInfo.currentConditions.cond = data.wxPhraseLong.replace("Showers in the Vicinity", "Showers Nearby").replace("/Wind", ", Windy").replace("Thunder in the Vicinity", "Thunder");
        weatherInfo.currentConditions.gusts = ((data.windGust != null || data.windGust != undefined) ? data.windGust : "None");
        weatherInfo.currentConditions.humidity = data.relativeHumidity + "%";
        weatherInfo.currentConditions.icon = data.iconCodeExtend;
        weatherInfo.currentConditions.pressure.trend = data.pressureTendencyTrend;
        weatherInfo.currentConditions.pressure.val = data.pressureAltimeter ? (isMetric() ? (data.pressureAltimeter > 500 ? (data.pressureAltimeter / 10).toFixed(1) : data.pressureAltimeter.toFixed(1)) : data.pressureAltimeter.toFixed(2)) : "";
        weatherInfo.currentConditions.temp = data.temperature;
        weatherInfo.currentConditions.dewpoint = data.temperatureDewPoint;
        weatherInfo.currentConditions.wind = ((data.windDirectionCardinal == "CALM" || data.windSpeed == 0 || data.windDirectionCardinal == undefined) ? "Calm" : data.windDirectionCardinal + " " + data.windSpeed);
        weatherInfo.currentConditions.visibility = data.visibility;
        weatherInfo.currentConditions.noReport = false;

        if (data.temperatureHeatIndex > data.temperature + 3) {
            weatherInfo.currentConditions.feelslike.type = "Heat Index";
            weatherInfo.currentConditions.feelslike.val = data.temperatureHeatIndex;
        } else if (data.temperatureWindChill < data.temperature - 3) {
            weatherInfo.currentConditions.feelslike.type = "Wind Chill";
            weatherInfo.currentConditions.feelslike.val = data.temperatureWindChill;
        } else {
            weatherInfo.currentConditions.feelslike.type = null;
        }
    }).fail(function () {
        weatherInfo.currentConditions.noReport = true;
    })
}
async function grabNearbyCC() {
    if(locationConfig.eightCities.cities.length == 0){
        weatherInfo.eightCities.noReport = true;
        return;
    }
    weatherInfo.eightCities.noReport = false;
    weatherInfo.eightCities.cities = [];
    var url = "https://api.weather.com/v3/aggcommon/v3-wx-observations-current?geocodes="
    for (var l = 0; l < 8; l++) {
        if (locationConfig.eightCities.cities[l]) {
            url += locationConfig.eightCities.cities[l].lat + "," + locationConfig.eightCities.cities[l].lon + ";"
        }
    }
    url += "&language=en-US&units=" + getUnits() + "&format=json&apiKey=" + api_key;

    $.getJSON(url, function (data) {
        data.forEach((ajaxedLoc, i) => {
            var eightslideloc = { name: "", temp: "", icon: "", wind: "" }
            eightslideloc.name = locationConfig.eightCities.cities[i].displayname;
            eightslideloc.temp = ajaxedLoc["v3-wx-observations-current"].temperature;
            eightslideloc.icon = ajaxedLoc["v3-wx-observations-current"].iconCodeExtend;
            eightslideloc.wind = {
                direction: ajaxedLoc["v3-wx-observations-current"].windSpeed == 0 ? "Calm" : ajaxedLoc["v3-wx-observations-current"].windDirectionCardinal,
                speed: ajaxedLoc["v3-wx-observations-current"].windSpeed
            }
            weatherInfo.eightCities.cities.push(eightslideloc)
        })
    }).fail(function () {
        weatherInfo.eightCities.noReport = true;
        for (var i = 0; i < 8; i++) {
            var eightslideNR = { name: !(locationConfig.eightCities.cities[i].displayname) ? "" : locationConfig.eightCities.cities[i].displayname, temp: "", icon: 4400, wind: "", windspeed: "" }
            weatherInfo.eightCities.cities.push(eightslideNR)
        }
    })
}
async function grabLocalForecast() {
    //includes 36 hour forecast and week ahead
    weatherInfo.dayDesc.days = [];
    weatherInfo.weekAhead.days = [];
    weatherInfo.almanac.days = [];
    var url = "https://api.weather.com/v3/wx/forecast/daily/7day?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&format=json&units=" + getUnits() + "&language=en-US&apiKey=" + api_key;
    $.getJSON(url, function (data) {
        markFeedSuccess("forecast");
        var dayOfWeek = { 0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday" }
        //36 HOUR
        for (var i = (data.daypart[0].daypartName[0] === null ? 1 : 0); i < (data.daypart[0].daypartName[0] === null ? 5 : 4); i++) {
            var dayDescToAdd = {
                name: data.daypart[0].daypartName[i]
                    .replace("Tomorrow", dayOfWeek[new Date().getHours() > 3 ? new Date().getDay() : new Date().getDay() - 1])
                    .replace(" night", " Night"),
                desc: data.daypart[0].narrative[i].replaceAll("F. ", ". ").replaceAll("C. ", ". "),
                narrQualiCode: data.daypart[0].qualifierCode[i] == null ? "" : data.daypart[0].qualifierCode[i].replace("Q",""),
                iconCode: data.daypart[0].iconCodeExtend[i],
                cond: { name: codetoFcst[data.daypart[0].iconCodeExtend[i]].mov, time: data.daypart[0].daypartName[i].endsWith("night") ? "_night" : "_day" }
            }
            weatherInfo.dayDesc.days.push(dayDescToAdd);
        }
        //7 DAY
        for (var j = 0; j < 7; j++) {
            var dayWAtoAdd = { name: "", cond: "", icon: "", high: "", low: "", windspeed: "" }
            dayWAtoAdd.name = data.dayOfWeek[data.daypart[0].wxPhraseLong[0] === null ? j + 1 : j].substring(0, 3).toUpperCase();
            dayWAtoAdd.cond = data.daypart[0].wxPhraseLong[(data.daypart[0].wxPhraseLong[0] === null ? (j * 2 + 2) : (j * 2))].replaceAll("Thunderstorms", "Thunder storms").replaceAll("Scattered", "Sct'd").replaceAll("Thundershowers", "Thunder showers").replaceAll("/Wind", " & Windy").replaceAll("Rain/", "Rain, ").replaceAll("Clouds/PM", "Clouds, PM");
            dayWAtoAdd.icon = data.daypart[0].iconCodeExtend[(data.daypart[0].iconCodeExtend[0] === null ? (j * 2 + 2) : (j * 2))];
            dayWAtoAdd.high = data.daypart[0].temperature[(data.daypart[0].temperature[0] === null ? (j * 2 + 2) : (j * 2))];
            dayWAtoAdd.low = data.daypart[0].temperature[(data.daypart[0].temperature[0] === null ? (j * 2 + 3) : (j * 2 + 1))];
            if (data.daypart[0].temperature[0] != null && j === 0) {
                dayWAtoAdd.low = "";
            }
            weatherInfo.weekAhead.days.push(dayWAtoAdd)
        }
        //ALMANAC
        var almOffset = data.dayOfWeek[0] === null ? 1 : 0;
        var almanacDayOne = {
            day: data.dayOfWeek[almOffset].toUpperCase(),
            sunrise: new Date(data.sunriseTimeLocal[almOffset]).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, minute: 'numeric' }).toLowerCase(),
            sunset: new Date(data.sunsetTimeLocal[almOffset]).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, minute: 'numeric' }).toLowerCase()
        }
        weatherInfo.almanac.days.push(almanacDayOne);
        var almanacDayTwo = {
            day: data.dayOfWeek[almOffset + 1].toUpperCase(),
            sunrise: new Date(data.sunriseTimeLocal[almOffset + 1]).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, minute: 'numeric' }).toLowerCase(),
            sunset: new Date(data.sunsetTimeLocal[almOffset + 1]).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, minute: 'numeric' }).toLowerCase()
        }
        weatherInfo.almanac.days.push(almanacDayTwo);
    }).fail(function () {
        weatherInfo.dayDesc.noReport = true;
        weatherInfo.weekAhead.noReport = true;
        weatherInfo.almanac.noReport = true;
        var periods = ["Today", "Tonight", "Tomorrow"]
        for (var i = 0; i < 3; i++) {
            var dayDescToAddNR = { name: periods[i], desc: "Temporarily Unavailable" }
            weatherInfo.dayDesc.days.push(dayDescToAddNR);
        }
        for (var j = 0; j < 7; j++) {
            var dayOfWeek = { 0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun" }
            var dayWAtoAddNR = { name: dayOfWeek[(new Date().getDay() + j) % 7], cond: "", icon: 4400, high: "", low: "" }
            weatherInfo.weekAhead.days.push(dayWAtoAddNR);
        }
        weatherInfo.almanac.days.push({ day: "", sunrise: "", sunset: "" });
        weatherInfo.almanac.days.push({ day: "", sunrise: "", sunset: "" });
    })
}
function grabMonthlyPrecip() {
    var url = "https://api.weather.com/v1/geocode/" + locationConfig.mainCity.lat + "/" + locationConfig.mainCity.lon + "/observations/current.json?language=en-US&units=" + getUnits() + "&apiKey=" + api_key;
    $.getJSON(url, function (data) {
        try {
            weatherInfo.monthlyPrecip = isMetric() ? data.observation.metric.precip_mtd.toFixed(1) : data.observation.imperial.precip_mtd.toFixed(2);
        } catch (error) {
            weatherInfo.monthlyPrecip = ""
        }
    }).fail(function () {
        weatherInfo.monthlyPrecip = ""
    })
}
async function grabAirQuality() {
    weatherInfo.airQuality.pollutants = [];
    var pollutantCount = 0;
    $.getJSON(`https://api.weather.com/v3/wx/globalAirQuality?geocode=${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}&language=en-US&scale=EPA&format=json&apiKey=${api_key}`, function (data) {
        weatherInfo.airQuality.category = data.globalairquality.airQualityCategory;
        weatherInfo.airQuality.categoryIndex = data.globalairquality.airQualityCategoryIndex;
        for (pollutant in data.globalairquality.pollutants) {
            pollutantCount++;
            if (data.globalairquality.pollutants[pollutant].categoryIndex == data.globalairquality.airQualityCategoryIndex) {
                var phr = data.globalairquality.pollutants[pollutant].phrase.startsWith("Particulate matter") ? "Particulate matter" : data.globalairquality.pollutants[pollutant].phrase;
                weatherInfo.airQuality.pollutants.push(phr);
            }
        }
        if (weatherInfo.airQuality.pollutants.length == 0 || weatherInfo.airQuality.pollutants.length == pollutantCount) {
            weatherInfo.airQuality.pollutants = [];
            weatherInfo.airQuality.pollutants.push("None");
        }
    })
}

async function grabAlmanac() {
    var date = new Date();
    date.setDate(date.getDate() - 1);
    var yidx = new Date().getHours() >= 15 ? 1 : 0;
    $.getJSON(`https://api.weather.com/v3/aggcommon/v3-wx-conditions-historical-dailysummary-30day;v3-wx-almanac-daily-5day?geocode=${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}&language=en-US&format=json&units=${getUnits()}&startDay=${date.getDate()}&startMonth=${date.getMonth() + 1}&apiKey=${api_key}`, function (data) {
        weatherInfo.almanac.stationname = locationConfig.mainCity.displayname.toUpperCase();
        var hist = data["v3-wx-conditions-historical-dailysummary-30day"];
        if (hist && hist.temperatureMax && hist.temperatureMax.length > 1) {
            var yHigh = hist.temperatureMax[1 - yidx] ?? hist.temperatureMax[1];
            var yLow = hist.temperatureMin[1 - yidx] ?? hist.temperatureMin[1];
            weatherInfo.almanac.yesterday.high = yHigh !== null && yHigh !== undefined ? Math.round(yHigh) : "";
            weatherInfo.almanac.yesterday.low = yLow !== null && yLow !== undefined ? Math.round(yLow) : "";
        }

        if (data["v3-wx-almanac-daily-5day"]) {
            weatherInfo.almanac.average.high = Math.round(data["v3-wx-almanac-daily-5day"].temperatureAverageMax[1]);
            weatherInfo.almanac.average.low = Math.round(data["v3-wx-almanac-daily-5day"].temperatureAverageMin[1]);
            weatherInfo.almanac.record.high = Math.round(data["v3-wx-almanac-daily-5day"].temperatureRecordMax[1]);
            weatherInfo.almanac.record.recordYearHigh = data["v3-wx-almanac-daily-5day"].almanacRecordYearMax[1];
            weatherInfo.almanac.record.low = Math.round(data["v3-wx-almanac-daily-5day"].temperatureRecordMin[1]);
            weatherInfo.almanac.record.recordYearLow = data["v3-wx-almanac-daily-5day"].almanacRecordYearMin[1];
        } else if (hist && hist.temperatureMax) {
            var validHighs = hist.temperatureMax.filter(v => v !== null && v !== undefined);
            var validLows = hist.temperatureMin.filter(v => v !== null && v !== undefined);
            if (validHighs.length > 0) {
                weatherInfo.almanac.average.high = Math.round(validHighs.reduce((a, b) => a + b, 0) / validHighs.length);
                weatherInfo.almanac.record.high = Math.round(Math.max(...validHighs));
                weatherInfo.almanac.record.recordYearHigh = "N/A";
            }
            if (validLows.length > 0) {
                weatherInfo.almanac.average.low = Math.round(validLows.reduce((a, b) => a + b, 0) / validLows.length);
                weatherInfo.almanac.record.low = Math.round(Math.min(...validLows));
                weatherInfo.almanac.record.recordYearLow = "N/A";
            }
        }
    });
}

async function grabDaypartForecast() {
    weatherInfo.daypartForecast.times = [];
    var dpHours = [];
    var dayOfWeek = {
        0: ["SUNDAY", "SUN NIGHT/MON", "MONDAY"], 1: ["MONDAY", "MON NIGHT/TUE", "TUESDAY"], 2: ["TUESDAY", "TUE NIGHT/WED", "WEDNESDAY"], 3: ["WEDNESDAY", "WED NIGHT/THU", "THURSDAY"],
        4: ["THURSDAY", "THU NIGHT/FRI", "FRIDAY"], 5: ["FRIDAY", "FRI NIGHT/SAT", "SATURDAY"], 6: ["SATURDAY", "SAT NIGHT/SUN", "SUNDAY"]
    };
    var dpCurrent = dateFns.getHours(new Date())
    if (dpCurrent < 5) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][0];
        dpHours = [6, 12, 15, 17];
    } else if (dpCurrent >= 5 && dpCurrent < 10) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][0];
        dpHours = [12, 15, 17, 20];
    } else if (dpCurrent >= 10 && dpCurrent < 14) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][1];
        dpHours = [15, 17, 20, 0];
    } else if (dpCurrent >= 14 && dpCurrent < 16) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][2];
        dpHours = [17, 20, 0, 6];
    } else if (dpCurrent >= 16) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][2];
        dpHours = [6, 12, 15, 17];
    }
    var url = "https://api.weather.com/v3/wx/forecast/hourly/2day?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&format=json&units=" + getUnits() + "&language=en-US&apiKey=" + api_key;
    $.getJSON(url, function (data) {
        // console.log(dateFns.getHours(data.validTimeLocal[0]));
        // console.log(data.precipChance[0]);
        if(data.precipChance[0] > 15){weatherInfo.specialModes.precip = true}
        var dpidx = 0;
        for (var i = 0; i < data.validTimeLocal.length; i++) {
            var dpTime = dateFns.getHours(data.validTimeLocal[i]);
            if (dpTime == dpHours[dpidx]) {
                var dayPartToAdd = { name: "", cond: "", icon: "", temp: "", wind: "", windspeed: "" }
                dayPartToAdd.name = { "0": "Midnight", "6": "6 am", "12": "Noon", "15": "3 pm", "17": "5 pm", "20": "8 pm" }[dpTime]
                dayPartToAdd.cond = data.wxPhraseLong[i].replaceAll("/Wind", " & Wind").replaceAll("Rain/", "Rain & ");
                dayPartToAdd.icon = data.iconCodeExtend[i]
                dayPartToAdd.temp = data.temperature[i]
                dayPartToAdd.wind = data.windSpeed[i] == 0 ? "Calm" : `${data.windDirectionCardinal[i]} ${data.windSpeed[i]}`
                dayPartToAdd.windspeed = data.windSpeed[i]
                weatherInfo.daypartForecast.times.push(dayPartToAdd);
                dpidx++;
            }
        }
    }).fail(function () {
        weatherInfo.daypartForecast.noReport = true;
        for (var i = 0; i < 4; i++) {
            weatherInfo.daypartForecast.times.push({ name: "", cond: "", icon: 4400, temp: "", wind: "", windspeed: "" });
        }
    })
}
async function grabMapCityData(){
    weatherInfo.map.mapCities = [];
    if (!locationConfig.regionalMap.map || locationConfig.regionalMap.map.length === 0) return;
    var url = 'https://api.weather.com/v3/aggcommon/v3-wx-observations-current;v3-wx-forecast-daily-3day?geocodes='
    for(let i = 0; i < locationConfig.regionalMap.map.length; i++){
        url = url + `${locationConfig.regionalMap.map[i].lat},${locationConfig.regionalMap.map[i].lon};`
    }
    url += "&language=en-US&units=" + getUnits() + "&format=json&apiKey=" + api_key;
    var midx = 0;
    $.getJSON(url, function(data){
        midx = data[0]["v3-wx-forecast-daily-3day"].daypart[0].temperature[0] == null ? 1 : 0;
        weatherInfo.map.days = [
            data[0]["v3-wx-forecast-daily-3day"].daypart[0].daypartName[midx],
            data[0]["v3-wx-forecast-daily-3day"].daypart[0].daypartName[midx+1] == "Tomorrow" ? data[0]["v3-wx-forecast-daily-3day"].dayOfWeek[1] : data[0]["v3-wx-forecast-daily-3day"].daypart[0].daypartName[midx+1],
        ]
        data.forEach((ajaxedLoc, i) =>{
            //console.log(ajaxedLoc);
            var mapObj = {
                name: locationConfig.regionalMap.map[i].name,
                current: {
                    temp: ajaxedLoc["v3-wx-observations-current"].temperature,
                    icon: ajaxedLoc["v3-wx-observations-current"].iconCodeExtend
                },
                forecasts: [
                    {
                        temp: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].temperature[midx],
                        icon: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].iconCodeExtend[midx]
                    },
                    {
                        temp: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].temperature[midx+1],
                        icon: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].iconCodeExtend[midx+1]
                    }
                ]
            }
            weatherInfo.map.mapCities.push(mapObj);
        })
    })
}

async function grabAlerts() {
    weatherInfo.bulletin.alerts = [];
    weatherInfo.bulletin.enabled = false;
    weatherInfo.bulletin.crawlAlert.enabled = false;
    weatherInfo.specialModes.bulletin = false;

    if (applyAlertTestModeIfNeeded()) {
        return;
    }

    var geocodes = [];
    if (locationConfig.mainCity && locationConfig.mainCity.lat !== "" && locationConfig.mainCity.lon !== "") {
        geocodes.push(`${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}`);
    }
    if (locationConfig.eightCities && Array.isArray(locationConfig.eightCities.cities)) {
        for (let i = 0; i < locationConfig.eightCities.cities.length; i++) {
            var city = locationConfig.eightCities.cities[i];
            if (!city || city.lat === "" || city.lon === "") {
                continue;
            }
            geocodes.push(`${city.lat},${city.lon}`);
        }
    }

    geocodes = [...new Set(geocodes)];
    if (geocodes.length === 0) {
        weatherInfo.bulletin.crawlAlert.alert = undefined;
        endAlertCrawl();
        return;
    }

    var alertRequests = geocodes.map((geocode) => {
        return new Promise((resolve) => {
            $.getJSON(`https://api.weather.com/v3/alerts/headlines?geocode=${geocode}&format=json&language=en-US&apiKey=${api_key}`, function (data) {
                resolve({ ok: true, data: data });
            }).fail(function () {
                resolve({ ok: false, data: null });
            });
        });
    });

    var alertResponses = await Promise.all(alertRequests);
    var successfulResponses = alertResponses.filter((response) => response.ok && response.data);

    if (successfulResponses.length === 0) {
        weatherInfo.bulletin.enabled = false;
        weatherInfo.bulletin.crawlAlert.enabled = false;
        weatherInfo.bulletin.crawlAlert.alert = undefined;
        endAlertCrawl();
        return;
    }

    markFeedSuccess("alerts");
    weatherInfo.bulletin.enabled = true;

    var mergedAlerts = [];
    for (let i = 0; i < successfulResponses.length; i++) {
        var responseAlerts = successfulResponses[i].data.alerts;
        if (!Array.isArray(responseAlerts)) {
            continue;
        }
        for (let j = 0; j < responseAlerts.length; j++) {
            mergedAlerts.push(responseAlerts[j]);
        }
    }

    var seenAlertKeys = new Set();
    var crawlAlertRequested = false;
    for (let i = 0; i < mergedAlerts.length; i++) {
        var sourceAlert = mergedAlerts[i];
        if (!sourceAlert) {
            continue;
        }

        if (sourceAlert.eventDescription == "Special Weather Statement") {
            if (sourceAlert.detailKey) {
                grabAlertCrawl(sourceAlert.detailKey);
            }
            continue;
        }

        var alertRules = warningSettings[sourceAlert.eventDescription];
        if (alertRules && !alertRules.included) {
            continue;
        }

        var dedupeKey = sourceAlert.detailKey || `${sourceAlert.eventDescription}|${sourceAlert.headlineText}`;
        if (seenAlertKeys.has(dedupeKey)) {
            continue;
        }
        seenAlertKeys.add(dedupeKey);

        var bulletinAlert = {
            name: sourceAlert.eventDescription,
            significance: sourceAlert.significance,
            desc: sourceAlert.headlineText,
            detailKey: sourceAlert.detailKey,
            severity: sourceAlert.severity,
            priority: alertRules ? alertRules.priority : 125
        };

        if (!crawlAlertRequested && sourceAlert.urgencyCode == 1 && bulletinAlert.detailKey) {
            weatherInfo.bulletin.crawlAlert.enabled = true;
            crawlAlertRequested = true;
            grabAlertCrawl(bulletinAlert.detailKey);
        } else {
            weatherInfo.bulletin.alerts.push(bulletinAlert);
        }
    }

    weatherInfo.bulletin.alerts = weatherInfo.bulletin.alerts.sort((a, b) => a.priority - b.priority);
    if (weatherInfo.bulletin.alerts.length > 0 || weatherInfo.bulletin.crawlAlert.enabled) {
        weatherInfo.specialModes.bulletin = true;
    } else {
        weatherInfo.specialModes.bulletin = false;
        weatherInfo.bulletin.enabled = false;
        weatherInfo.bulletin.crawlAlert.enabled = false;
        weatherInfo.bulletin.crawlAlert.alert = undefined;
        endAlertCrawl();
    }
}
function grabAlertCrawl(dKey) {
    weatherInfo.bulletin.crawlAlert.enabled = true;
    if(weatherInfo.bulletin.crawlAlert.alert != undefined){
        if(weatherInfo.bulletin.crawlAlert.alert.detailKey == dKey) return;
    }
    $.getJSON('https://api.weather.com/v3/alerts/detail?alertId=' + dKey + '&format=json&language=en-US&apiKey=' + api_key, function (data) {
        console.log(data);
        if(weatherInfo.bulletin.crawlAlert.alert != undefined && (weatherInfo.bulletin.crawlAlert.alert.priority > warningSettings[data.alertDetail.eventDescription].priority)) return;
        var alert = {
            name: data.alertDetail.eventDescription,
            code: data.alertDetail.productIdentifier,
            type: data.alertDetail.messageType,
            significance: data.alertDetail.significance,
            description: data.alertDetail.texts[0].description,
            severe: warningSettings[data.alertDetail.eventDescription].severe,
            priority: warningSettings[data.alertDetail.eventDescription].priority,
            detailKey: dKey
        }
        if (alert.severe) {
            weatherInfo.bulletin.crawlAlert.alert = [];
        }
        weatherInfo.bulletin.crawlAlert.alert = alert;
        setTimeout(startAlertCrawl, 1000);
    });
}
async function grabMoonphases(){
    await $.getJSON(`https://www.icalendar37.net/lunar/api/?lang=en&month=${dateFns.format(new Date(),"M")}&year=${dateFns.format(new Date(),"YYYY")}`, function(data){
        for(phase in data.phase){
            if(data.phase[phase].isPhaseLimit != false){
                if(phase < new Date().getDate()){ continue; }
                var moonphaseToAdd = {date:"",type:""}
                moonphaseToAdd.date = data.monthName.substring(0,3) + " " + phase;
                moonphaseToAdd.type = data.phase[phase].phaseName.split(" ")[0];
                weatherInfo.almanac.moonphases.push(moonphaseToAdd);
            }
        }
    })
    await $.getJSON(`https://www.icalendar37.net/lunar/api/?lang=en&month=${dateFns.format(dateFns.addMonths(new Date(),1),"M")}&year=${dateFns.format(new Date(),"YYYY")}`, function(data){
        for(phase in data.phase){
            if(data.phase[phase].isPhaseLimit != false){
                var moonphaseToAdd = {date:"",type:""}
                moonphaseToAdd.date = data.monthName.substring(0,3) + " " + phase;
                moonphaseToAdd.type = data.phase[phase].phaseName.split(" ")[0]
                weatherInfo.almanac.moonphases.push(moonphaseToAdd);
            }
        }
    })
}
async function grabOutdoorActivityData(){
    var oaCurrent = () => {
        if(dateFns.getHours(new Date()) <= 6){
            return 9;
        }else if(dateFns.getHours(new Date()) <= 11){
            //weatherInfo.outdoorActivity.bg = 2; //so it has come to my attention that v2 has two images instead of one, whatever ig
            return 14;
        }else if(dateFns.getHours(new Date()) <= 16){
            weatherInfo.outdoorActivity.bg = 3;
            return 19;
        }
        return 9;
    }
    var url = "https://api.weather.com/v3/wx/forecast/hourly/1day?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&format=json&units=" + getUnits() + "&language=en-US&apiKey=" + api_key;
    $.getJSON(url, function(data){
        try {
            for(let i = 0; i < data.validTimeLocal.length; i++){
                if(dateFns.getHours(data.validTimeLocal[i]) == oaCurrent()){
                    weatherInfo.outdoorActivity.time = `${dateFns.format(data.validTimeLocal[i], 'h')}${oaCurrent() == 9 ? "am" : "pm"} ${data.dayOfWeek[i]}`;
                    weatherInfo.outdoorActivity.temp = data.temperature[i];
                    weatherInfo.outdoorActivity.cond = data.wxPhraseLong[i];
                    weatherInfo.outdoorActivity.icon = data.iconCodeExtend[i];
                    weatherInfo.outdoorActivity.wind = data.windDirectionCardinal[i] + " " + data.windSpeed[i];
                    if(data.temperatureHeatIndex[i] > data.temperature[i] + 3){
                        weatherInfo.outdoorActivity.feelslike.type = "Heat Index";
                        weatherInfo.outdoorActivity.feelslike.val = data.temperatureHeatIndex[i];
                    }else if(data.temperatureWindChill[i] < data.temperature[i] - 3){
                        weatherInfo.outdoorActivity.feelslike.type = "Wind Chill";
                        weatherInfo.outdoorActivity.feelslike.val = data.temperatureWindChill[i];
                    }
                    break;
                }
            }
        } catch (error) {
            weatherInfo.outdoorActivity.noReport = true;
        }
    }).fail(function(){
        weatherInfo.outdoorActivity.noReport = true;
    })
}