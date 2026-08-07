var regradar, locradar, radarsat, 
  regoutlines, locoutlines, regoutlinestrans, locoutlinestrans,
  regmap, locmap,
  regtimestamps, loctimestamps, sattimestamps,
  radarAnimation, animationInterval;

window.__iptvMapsAvailable = true;

function setMapsAvailability(available, reason) {
  window.__iptvMapsAvailable = available;
  if (!available && reason) {
    console.warn(`[IPTV] ${reason}`);
  }
}

var mapStyle = {
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

function buildLocalRadarStyle(baseStyle) {
  var localStyle = JSON.parse(JSON.stringify(baseStyle || mapStyle));
  if (localStyle.sources && localStyle.sources["raster-tiles"]) {
    localStyle.sources["raster-tiles"].tiles = [
      "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    ];
  }
  return localStyle;
}

async function createMaps() {
  var radarCoords = [
    !locationConfig.mainCity.lon || !locationConfig.mainCity.lat ? 0 : locationConfig.mainCity.lon,
    !locationConfig.mainCity.lat || !locationConfig.mainCity.lon ? 0 : locationConfig.mainCity.lat
  ];
  var regionalMapStyle = mapStyle;
  var localMapStyle = buildLocalRadarStyle(mapStyle);
  try {
    regradar = new maplibregl.Map({
      container: "regradar",
      style: regionalMapStyle,
      zoom: 7.7,
      center: radarCoords
    });

    regmap = new maplibregl.Map({
      container: "regmap",
      style: regionalMapStyle,
      zoom: 7.7,
      center: radarCoords
    });

    regoutlines = new maplibregl.Map({
      container: "regoutlines",
      style: regionalMapStyle,
      zoom: 7.7,
      center: radarCoords
    });

    regoutlinestrans = new maplibregl.Map({
      container: "regoutlinestrans",
      style: regionalMapStyle,
      zoom: 7.7,
      center: radarCoords
    });

    locradar = new maplibregl.Map({
      container: "locradar",
      style: localMapStyle,
      zoom: 8.65,
      center: radarCoords
    });

    locmap = new maplibregl.Map({
      container: "locmap",
      style: localMapStyle,
      zoom: 8.65,
      center: radarCoords
    });

    locoutlines = new maplibregl.Map({
      container: "locoutlines",
      style: localMapStyle,
      zoom: 8.65,
      center: radarCoords
    });

    locoutlinestrans = new maplibregl.Map({
      container: "locoutlinestrans",
      style: localMapStyle,
      zoom: 8.65,
      center: radarCoords
    });

    setMapsAvailability(true);
    setTimeout(async () => {
      await preloadRadars();
    }, 1000);
  } catch (error) {
    regradar = null;
    regmap = null;
    regoutlines = null;
    regoutlinestrans = null;
    locradar = null;
    locmap = null;
    locoutlines = null;
    locoutlinestrans = null;
    setMapsAvailability(false, `Map rendering disabled: ${error.message}`);
  }
}

async function fetchRadarTimestamps(map, frameCount) {
  var timestamps = loctimestamps;
  timestamps = [];
  var mapType = map === radarsat ? "satrad" : "twcRadarMosaic";
  try {
    const response = await fetch(
      `https://api.weather.com/v3/TileServer/series/productSet/PPAcore?filter=${mapType}&apiKey=${api_key}`
    );
    const data = await response.json();

    if (mapType === "twcRadarMosaic" && !data.seriesInfo?.twcRadarMosaic) {
      console.error("No radar series info found.");
      return [];
    }

    if (typeof window.markFeedSuccess === "function") {
      window.markFeedSuccess("radar");
    }

    return (sortedTS = data.seriesInfo.twcRadarMosaic.series
      .sort((a, b) => a.ts - b.ts)
      .map((item) => item.ts)
      .slice(-frameCount));
  } catch (error) {
    console.error("Failed to fetch radar timestamps:", error);
    return [];
  }
}

async function addRadarLayers(map, timestamps) {
  for (const timestamp of timestamps) {
    const sourceId = `radar_${timestamp}`;
    const layerId = `radarlayer_${timestamp}`;
    const mapType = map === radarsat ? "satrad" : "twcRadarMosaic";

    if (!map.getSource(sourceId)) {
      // Add raster source for the timestamp
      map.addSource(sourceId, {
        type: "raster",
        tiles: [
          `https://api.weather.com/v3/TileServer/tile/${mapType}?ts=${timestamp}&xyz={x}:{y}:{z}&apiKey=${api_key}`,
        ],
        tileSize: 512,
        minzoom: 5,
        maxzoom: 12,
      });
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        layout: { visibility: "none" },
        paint: {
          "raster-opacity": 1,
          "raster-fade-duration": 0,
          "raster-brightness-max": 0.9,
        },
      });
    }
  }
}

function animateRadar(map, timestamps) {
  clearInterval(radarAnimation);
  clearInterval(animationInterval);
  let interval = 83.333333333333333;
  const layerPrefix = "radarlayer_";
  let currentIndex = 0;

  if (timestamps == undefined) {
    if (map === locradar) timestamps = loctimestamps;
  }
  const validLayers = (timestamps || [])
    .map((ts) => `${layerPrefix}${ts}`)
    .filter((layerId) => map.getLayer(layerId));

  if (validLayers.length === 0) {
    console.error("No radar layers available for animation.");
    weatherInfo.radarUnavailable = true;
    return;
  } else {
    weatherInfo.radarUnavailable = false;
  }

  const setLayerVisibility = (layerId, visibility) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  };

  validLayers.forEach((layerId) => setLayerVisibility(layerId, "none"));
  setLayerVisibility(validLayers[0], "visible");

  const startLoop = () => {
    clearInterval(animationInterval);
    animationInterval = setInterval(() => {
      setLayerVisibility(validLayers[currentIndex], "none");
      currentIndex = (currentIndex + 1) % validLayers.length;
      setLayerVisibility(validLayers[currentIndex], "visible");
      if (currentIndex === validLayers.length - 1) {
        clearInterval(animationInterval);
      }
    }, interval);
  };

  startLoop();
  radarAnimation = setInterval(startLoop, interval * validLayers.length + 1000);
}

function cleanupOldRadarLayers(map, timestamps) {
  const layerPrefix = "radarlayer_";

  map
    .getStyle()
    .layers.filter((layer) => layer.id.startsWith(layerPrefix))
    .forEach((layer) => {
      const timestamp = layer.id.split("_")[1];
      if (!timestamps.includes(Number(timestamp))) {
        map.removeLayer(layer.id);
        map.removeSource(layer.source);
      }
    });
}
async function initializeRadar(map) {
  var timestamps = map === locradar ? loctimestamps : regtimestamps;
  //cleanupOldRadarLayers(map, timestamps);
  clearInterval(radarAnimation);
  if (map == locradar) {
    loctimestamps = await fetchRadarTimestamps(map, 36);
    await addRadarLayers(map, loctimestamps);
  } else if (map == regradar) {
    regtimestamps = await fetchRadarTimestamps(map, 36);
    await addRadarLayers(map, regtimestamps);
  }
  //const animation = animateRadar(map, timestamps)
  map.resize();
}

async function startRadar(map) {
  var timestamps = map === locradar ? loctimestamps : regtimestamps;
  // cleanupOldRadarLayers(map, timestamps)
  clearInterval(radarAnimation);
  // timestamps = await fetchRadarTimestamps(map)
  // await addRadarLayers(map, timestamps)
  const animation = animateRadar(map, timestamps);
  map.resize();
}
/*
async function startRadar(map) {
    //cleanupOldRadarLayers(map, timestamps)
    //clearInterval(radarAnimation)
    //await addRadarLayers(map, timestamps)
    //const animation = animateRadar(map, timestamps)
    map.resize()
}*/

//maybe use this later?
function stopRadar(map, timestamps) {
  const layerPrefix = "radarlayer_";
  //var timestamps = map === locradar ? loctimestamps : map === regradar ? regtimestamps : sattimestamps; //map is not defined, very smart move there jenson
  const validLayers = timestamps
    .map((ts) => `${layerPrefix}${ts}`)
    .filter((layerId) => map.getLayer(layerId));
  const setLayerVisibility = (layerId, visibility) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  };
  validLayers.forEach((layerId) => setLayerVisibility(layerId, "none"));
  clearInterval(radarAnimation);
}

function addRadarCities(){
  $(".reg-cities").empty();
  $(".reg-cities-trans").empty();
  $(".loc-cities").empty();
  $(".loc-cities-trans").empty();
  for(let i = 0; i < locationConfig.radarCities.regional.length; i++){
    $(".reg-cities").append(`
      <div class="radar-city ${numToWord(i)}" style="top: ${locationConfig.radarCities.regional[i].dotTopPos}px; left: ${locationConfig.radarCities.regional[i].dotLeftPos}px;">
        <div class="dot"></div>
        <div class="city-name" style="margin-top: ${locationConfig.radarCities.regional[i].nameTopMargin}px; margin-left: ${locationConfig.radarCities.regional[i].nameLeftMargin}px;">${locationConfig.radarCities.regional[i].locationName}</div>
      </div>`)
    $(".reg-cities-trans").append(`
      <div class="radar-city ${numToWord(i)}" style="top: ${locationConfig.radarCities.regional[i].dotTopPos}px; left: ${locationConfig.radarCities.regional[i].dotLeftPos}px;">
        <div class="dot-trans"></div>
        <div class="dot-outline"></div>
        <div class="city-name-trans" style="margin-top: ${locationConfig.radarCities.regional[i].nameTopMargin}px; margin-left: ${locationConfig.radarCities.regional[i].nameLeftMargin}px;">${locationConfig.radarCities.regional[i].locationName}</div>
      </div>`)
  }
  for(let i = 0; i < locationConfig.radarCities.local.length; i++){
    $(".loc-cities").append(`
      <div class="radar-city ${numToWord(i)}" style="top: ${locationConfig.radarCities.local[i].dotTopPos}px; left: ${locationConfig.radarCities.local[i].dotLeftPos}px;">
        <div class="dot"></div>
        <div class="city-name" style="margin-top: ${locationConfig.radarCities.local[i].nameTopMargin}px; margin-left: ${locationConfig.radarCities.local[i].nameLeftMargin}px;">${locationConfig.radarCities.local[i].locationName}</div>
      </div>`)
    $(".loc-cities-trans").append(`
      <div class="radar-city ${numToWord(i)}" style="top: ${locationConfig.radarCities.local[i].dotTopPos}px; left: ${locationConfig.radarCities.local[i].dotLeftPos}px;">
        <div class="dot-trans"></div>
        <div class="dot-outline"></div>
        <div class="city-name-trans" style="margin-top: ${locationConfig.radarCities.local[i].nameTopMargin}px; margin-left: ${locationConfig.radarCities.local[i].nameLeftMargin}px;">${locationConfig.radarCities.local[i].locationName}</div>
      </div>`)
  }
}

async function preloadRadars(){
  await initializeRadar(regradar);
  await initializeRadar(locradar);
  $('.radar').fadeIn(0);
  $('#regradar').fadeIn(0);
  $('#regmap').fadeIn(0);
  $('#regoutlines').fadeIn(0);
  $('#regoutlinestrans').fadeIn(0);
  $('#locradar').fadeIn(0);
  $('#locmap').fadeIn(0);
  $('#locoutlines').fadeIn(0);
  $('#locoutlinestrans').fadeIn(0);
  locmap.resize();
  locradar.resize();
  locoutlines.resize();
  locoutlinestrans.resize();
  regmap.resize();
  regradar.resize();
  regoutlines.resize();
  regoutlinestrans.resize();
  setTimeout(() => {
    $('.radar').fadeOut(0);
    $('#regradar').fadeOut(0);
    $('#regmap').fadeOut(0);
    $('#regoutlines').fadeOut(0);
    $('#regoutlinestrans').fadeOut(0);
    $('#locradar').fadeOut(0);
    $('#locmap').fadeOut(0);
    $('#locoutlines').fadeOut(0);
    $('#locoutlinestrans').fadeOut(0);
  }, 2000);
}

async function refreshRadarFrames() {
  if (!regradar || !locradar) {
    return;
  }

  try {
    regtimestamps = await fetchRadarTimestamps(regradar, 36);
    await addRadarLayers(regradar, regtimestamps);

    loctimestamps = await fetchRadarTimestamps(locradar, 36);
    await addRadarLayers(locradar, loctimestamps);
  } catch (error) {
    console.error("Failed to refresh radar frames:", error);
  }
}

window.refreshRadarFrames = refreshRadarFrames;