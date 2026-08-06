var locationConfig = {
    mainCity: {
        displayname: "",
        extraname: "",
        lat: "",
        lon: "",
        state: "",
        stateFull: "",
    },
    eightCities: {
        cities: [],
    },
    regionalMap: {
        leftPos: "",
        topPos: "",
        map: [],
        autoFind: true
    },
    radarCities: {
        local: [
        ],
        regional: [
        ],
    }
}
var mainquery = undefined;
var queryFail = false;
let locationQueue = [];
let newCities = [];
const CONFIG_ENDPOINT = "/api/config";
let locationConfigLoadError = "";

function setLocationConfigError(message) {
    locationConfigLoadError = message;
    console.error("[Config] " + message);
    $(".loctext").text("Location Error: " + message);
    $(".loctext").css("color", "#ff8f8f");
    $("#data-last-updated").text("Weather Data: blocked by config error").addClass("error");
    $("#startbutton").css("opacity", "0.5");
    $("#startbutton").css("pointer-events", "none");
}

function clearLocationConfigError() {
    locationConfigLoadError = "";
    $(".loctext").css("color", "");
    $("#data-last-updated").removeClass("error");
    $("#startbutton").css("opacity", "");
    $("#startbutton").css("pointer-events", "");
}

function configHasRequiredLocation(configObj) {
    if (!configObj || !configObj.mainCity) return false;
    const city = configObj.mainCity;
    return city.autoFind === false && city.type === "geocode" && typeof city.val === "string" && city.val.includes(",");
}

async function loadLocationSettingsFromConfig() {
    try {
        const response = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
            setLocationConfigError("MYCONFIG.json could not be loaded from /api/config.");
            return false;
        }
        const json = await response.json();
        if (!configHasRequiredLocation(json)) {
            setLocationConfigError("MYCONFIG.json is invalid. mainCity.autoFind must be false and mainCity.val must be geocode lat,lon.");
            return false;
        }
        Object.assign(locationSettings, json);
        clearLocationConfigError();
        console.log("[Config] MYCONFIG.json loaded and applied.");
        return true;
    } catch (error) {
        setLocationConfigError("Failed to load MYCONFIG.json: " + error.message);
        return false;
    }
}

function getJSONPromise(url) {
    return new Promise((resolve, reject) => {
        $.getJSON(url, resolve).fail((jqxhr, textStatus, errorThrown) => {
            reject(new Error(errorThrown || textStatus || "Request failed"));
        });
    });
}

async function grabLocation() {
    clearInterval(locNameInterval);
    clearInterval(dataGrabInterval);
    $("#startbutton").css("opacity", "0.5");
    $("#startbutton").css("pointer-events", "none");
    const configLoaded = await loadLocationSettingsFromConfig();
    if (!configLoaded) {
        return;
    }
    locationConfig.mainCity = {displayname: "", extraname: "", lat: "", lon: "", state: "", stateFull: "", country: ""}
    locationQueue = [];
    newCities = [];
    locationConfig.eightCities.cities = [];
    locationConfig.regionalMap.map = [];
    await getMainCity();
    await getNearbyCities();
    sortRegionalList();
    mainquery = undefined;
}

async function getMainCity() {
    try {
        locationConfig.mainCity.displayname = locationSettings.mainCity.displayname || "";
        locationConfig.mainCity.extraname = locationSettings.mainCity.extraname || locationSettings.mainCity.displayname || "";
        if (locationSettings.eightCities && locationSettings.eightCities.cities) {
            locationConfig.eightCities.cities = locationSettings.eightCities.cities.map(c => ({
                displayname: c.displayname,
                lat: "",
                lon: "",
                state: "",
                stateFull: ""
            }));
        }
        const data = await getJSONPromise("https://api.weather.com/v3/location/point?" + locationSettings.mainCity.type + "=" + locationSettings.mainCity.val + "&language=en-US&format=json&apiKey=" + api_key);
        var cCountry = data.location.country || "US";
        getMapStyle(cCountry, data.location.adminDistrictCode);
        locationConfig.mainCity.displayname = locationSettings.mainCity.displayname || data.location.displayName;
        locationConfig.mainCity.extraname = locationSettings.mainCity.extraname || data.location.displayName;
        locationConfig.mainCity.lat = data.location.latitude;
        locationConfig.mainCity.lon = data.location.longitude;
        locationConfig.mainCity.state = data.location.adminDistrictCode;
        locationConfig.mainCity.stateFull = data.location.adminDistrict;
        locationConfig.mainCity.country = cCountry;

        if (!locationSettings.radarCities.local || locationSettings.radarCities.local.length === 0 || !locationSettings.radarCities.local[0].locationName) {
            locationConfig.radarCities.local = [{ locationName: locationConfig.mainCity.displayname, dotTopPos: 520, dotLeftPos: 810, nameTopMargin: -7, nameLeftMargin: 43 }];
        } else {
            locationConfig.radarCities.local = locationSettings.radarCities.local;
        }
        if (!locationSettings.radarCities.regional || locationSettings.radarCities.regional.length === 0 || !locationSettings.radarCities.regional[0]?.locationName) {
            locationConfig.radarCities.regional = [{ locationName: locationConfig.mainCity.displayname, dotTopPos: 520, dotLeftPos: 810, nameTopMargin: -7, nameLeftMargin: 43 }];
        } else {
            locationConfig.radarCities.regional = locationSettings.radarCities.regional;
        }

        locationConfig.regionalMap.autoFind = locationSettings.mapCities.autoFind;
        locationConfig.regionalMap.leftPos = locationSettings.mapCities.leftPos;
        locationConfig.regionalMap.topPos = locationSettings.mapCities.topPos;
    } catch (error) {
        queryFail = true;
        setLocationConfigError("Unable to resolve MYCONFIG mainCity geocode: " + error.message);
        throw error;
    }
}
let nearbyRound = 0;
//bit of a rewrite inspired from BFS nearby loc pull
async function getNearbyCities() {
    newCities = [];
    if (!locationSettings.eightCities || !Array.isArray(locationSettings.eightCities.cities)) {
        locationConfig.eightCities.cities = [];
        return;
    }
    for (let i = 0; i < locationSettings.eightCities.cities.length; i++) {
        const entry = locationSettings.eightCities.cities[i];
        if (!entry || !entry.type || !entry.val) {
            continue;
        }
        await createNewCity(entry.type, entry.val, i, true);
    }
    locationConfig.eightCities.cities = newCities.filter(c => c !== undefined);
}
function createNewCity(type, val, i, manual) {
    return new Promise((resolve) => {
        $.getJSON(`https://api.weather.com/v3/location/point?${type}=${val}&language=en-US&format=json&apiKey=${api_key}`, function (data) {
            var cityObj = {
                displayname: data.location.displayName.replaceAll(" Charter Township", "").replaceAll(" Township", ""),
                lat: data.location.latitude,
                lon: data.location.longitude,
                state: data.location.adminDistrictCode,
                stateFull: data.location.adminDistrict
            }
            if(manual == true){
                cityObj.displayname = (locationSettings.eightCities.cities[i] && locationSettings.eightCities.cities[i].displayname !== "") ? locationSettings.eightCities.cities[i].displayname : data.location.displayName;
                newCities[i] = cityObj;
            }else{
                for(let j = 0; j < newCities.length; j++){
                    if(newCities[j] && cityObj.displayname == newCities[j].displayname) {
                        resolve(null);
                        return;
                    }
                    if(newCities[j] && cityObj.displayname == newCities[j].stateFull) {
                        resolve(null);
                        return;
                    }
                    if(newCities.filter(c => c !== undefined).length >= 8) {
                        resolve(null);
                        return;
                    }
                }
                newCities.push(cityObj);
            }
            resolve(cityObj);
        }).fail(() => {
            resolve(null);
        });
    });
}
//for adv loc settings
var elDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"]
function createNewExtraCity(i){
    $('.extracitytext').text("Location editing is locked to MYCONFIG.json. Edit that file and reload.");
    $(".extracitytext").css('color', 'darkred');
    $('.extracitytext').fadeIn(0, function(){
        setTimeout(() => {
            $('.extracitytext').fadeOut(1000);
        }, 2500);
    })
}

var distances = []
var distances = []
var rmBoundaries = [265, 270, 715, 630]
function sortRegionalList(){
    locationConfig.regionalMap.leftPos = locationSettings.mapCities.leftPos || -3353;
    locationConfig.regionalMap.topPos = locationSettings.mapCities.topPos || 1297;
    locationConfig.regionalMap.autoFind = locationSettings.mapCities.autoFind;

    if(locationSettings.mapCities.autoFind == false && locationSettings.mapCities.map && locationSettings.mapCities.map.length > 0){
        locationConfig.regionalMap.map = [];
        for(let i = 0; i < locationSettings.mapCities.map.length; i++){
            locationConfig.regionalMap.map[i] = locationSettings.mapCities.map[i];
        }
        centerMap(0, false);
        return;
    }

    // Build the list of cities configured in MYCONFIG.json / locationConfig
    let userCities = [];
    if (locationConfig.mainCity && locationConfig.mainCity.displayname) {
        userCities.push({
            name: locationConfig.mainCity.displayname,
            lat: locationConfig.mainCity.lat,
            lon: locationConfig.mainCity.lon
        });
    }
    if (locationConfig.eightCities && locationConfig.eightCities.cities) {
        for (let c of locationConfig.eightCities.cities) {
            if (c && c.displayname) {
                userCities.push({
                    name: c.displayname,
                    lat: c.lat,
                    lon: c.lon
                });
            }
        }
    }

    let savedMap = (locationSettings.mapCities && locationSettings.mapCities.map && locationSettings.mapCities.map.length > 0) ? locationSettings.mapCities.map : [];
    locationConfig.regionalMap.map = [];

    for (let i = 0; i < userCities.length && i < 10; i++) {
        let city = userCities[i];
        let saved = savedMap.find(m => m.name === city.name);
        if (saved && saved.left !== undefined && saved.top !== undefined && saved.left !== "") {
            locationConfig.regionalMap.map.push({
                name: city.name,
                lat: city.lat,
                lon: city.lon,
                left: Number(saved.left),
                top: Number(saved.top)
            });
        } else {
            let refMatch = regionalMapCities.find(r => r.name.toLowerCase() === city.name.toLowerCase());
            if (refMatch) {
                locationConfig.regionalMap.map.push({
                    name: city.name,
                    lat: city.lat,
                    lon: city.lon,
                    left: refMatch.left,
                    top: refMatch.top
                });
            } else {
                let dists = regionalMapCities.map((r) => {
                    let d = distanceByDegrees(city, r);
                    return { distance: d[0], ref: r };
                }).sort((a, b) => a.distance - b.distance);
                
                let nearest = dists[0].ref;
                let dLat = parseFloat(city.lat) - parseFloat(nearest.lat);
                let dLon = parseFloat(city.lon) - parseFloat(nearest.lon);
                let left = Math.round(nearest.left + dLon * 160);
                let top = Math.round(nearest.top - dLat * 425);
                locationConfig.regionalMap.map.push({
                    name: city.name,
                    lat: city.lat,
                    lon: city.lon,
                    left: left,
                    top: top
                });
            }
        }
    }

    centerMap(0, locationSettings.mapCities.autoFind !== false);
}

// Auto-load MYCONFIG.json from server, then resolve location
(async function autoLoadConfig() {
    const loaded = await loadLocationSettingsFromConfig();
    if (!loaded) {
        return;
    }
    await grabLocation();
    setTimeout(() => {
        onLocationInit();
    }, 100);
})();

function getMapStyle(country, state){
    mapStyle = {
        version: 8,
        sources: {
            "raster-tiles": {
                type: "raster",
                tiles: [
                    "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                ],
                tileSize: 256,
                attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
            },
        },
        layers: [
            {
                id: "basemap",
                type: "raster",
                source: "raster-tiles",
                layout: { visibility: "visible" },
                minzoom: 0,
                maxzoom: 22,
                paint: {
                    "raster-opacity": 1,
                },
            },
        ],
    };
}